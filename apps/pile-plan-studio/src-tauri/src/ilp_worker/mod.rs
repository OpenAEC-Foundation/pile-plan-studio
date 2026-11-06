//! Own only the optimizer subprocess. The UI/project never lives in this worker.
mod protocol;

use pile_plan_core::{
    IlpEvent, IlpOptimizationOutcome, IlpOptimizationSession, IlpProgress, IlpRunRequest,
};
use std::io::{BufReader, BufWriter};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc, Arc,
};
use std::thread::{self, JoinHandle};
use std::time::Duration;

const WORKER_ARGUMENT: &str = "--opps-ilp-worker";
const FAILURE: &str = "ilp_worker_failed";

pub fn is_worker_process() -> bool {
    std::env::args_os()
        .nth(1)
        .is_some_and(|argument| argument == WORKER_ARGUMENT)
}

pub fn worker_main() {
    let mut session = IlpOptimizationSession::new();
    serve_with(move |request, progress| session.run(request, progress, &|| false));
}

fn serve_with(
    mut run: impl FnMut(IlpRunRequest, &mut dyn FnMut(IlpProgress)) -> IlpOptimizationOutcome,
) {
    let (sender, requests) = mpsc::channel::<IlpRunRequest>();
    thread::spawn(move || {
        let stdin = std::io::stdin();
        let mut input = stdin.lock();
        loop {
            let request = match protocol::read_frame(&mut input, false) {
                Ok(request) => request,
                // EOF means the host is gone. Exit this isolated process even
                // when the solver thread cannot service cancellation callbacks.
                Err(error) => {
                    std::process::exit(if error.kind() == std::io::ErrorKind::UnexpectedEof {
                        0
                    } else {
                        2
                    })
                }
            };
            if sender.send(request).is_err() {
                std::process::exit(0);
            }
        }
    });
    let stdout = std::io::stdout();
    let mut output = BufWriter::new(stdout.lock());
    for request in requests {
        let run_id = request.run_id.clone();
        let mut progress = |progress| {
            if protocol::write_frame(
                &mut output,
                &IlpEvent::Progress {
                    run_id: run_id.clone(),
                    progress,
                },
            )
            .is_err()
            {
                std::process::exit(3);
            }
        };
        let outcome = run(request, &mut progress);
        drop(progress);
        if protocol::write_frame(&mut output, &IlpEvent::Finished { run_id, outcome }).is_err() {
            std::process::exit(3);
        }
    }
}

pub struct NativeIlpWorker {
    child: Child,
    input: Option<ChildStdin>,
    events: mpsc::Receiver<Result<IlpEvent, String>>,
    reader: Option<JoinHandle<()>>,
    reader_stop: Arc<AtomicBool>,
    reusable: bool,
}

impl NativeIlpWorker {
    pub fn spawn() -> Result<Self, String> {
        let mut command = Command::new(std::env::current_exe().map_err(|_| FAILURE.to_string())?);
        #[cfg(not(test))]
        command.arg(WORKER_ARGUMENT);
        #[cfg(test)]
        command
            .args([
                "--ignored",
                "--exact",
                "ilp_worker::tests::worker_entrypoint",
                "--nocapture",
            ])
            .env("OPPS_ILP_WORKER_TEST", "1");
        Self::spawn_command(command)
    }

    fn spawn_command(mut command: Command) -> Result<Self, String> {
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        let mut child = command.spawn().map_err(|_| FAILURE.to_string())?;
        let Some(input) = child.stdin.take() else {
            let _ = child.kill();
            let _ = child.wait();
            return Err(FAILURE.into());
        };
        let Some(stdout) = child.stdout.take() else {
            drop(input);
            let _ = child.kill();
            let _ = child.wait();
            return Err(FAILURE.into());
        };
        let (sender, events) = mpsc::sync_channel(4);
        let reader_stop = Arc::new(AtomicBool::new(false));
        let stop = reader_stop.clone();
        let reader = match thread::Builder::new()
            .name("ilp-worker-events".into())
            .spawn(move || {
                let mut output = BufReader::new(stdout);
                let mut first = true;
                loop {
                    if stop.load(Ordering::Relaxed) {
                        return;
                    }
                    let mut event =
                        protocol::read_frame(&mut output, first).map_err(|_| FAILURE.to_string());
                    first = false;
                    let terminal = event.is_err();
                    loop {
                        if stop.load(Ordering::Relaxed) {
                            return;
                        }
                        match sender.try_send(event) {
                            Ok(()) => break,
                            Err(mpsc::TrySendError::Full(value)) => {
                                event = value;
                                thread::sleep(Duration::from_millis(5));
                            }
                            Err(mpsc::TrySendError::Disconnected(_)) => return,
                        }
                    }
                    if terminal {
                        return;
                    }
                }
            }) {
            Ok(reader) => reader,
            Err(_) => {
                drop(input);
                let _ = child.kill();
                let _ = child.wait();
                return Err(FAILURE.into());
            }
        };
        Ok(Self {
            child,
            input: Some(input),
            events,
            reader: Some(reader),
            reader_stop,
            reusable: true,
        })
    }

    pub fn run(
        &mut self,
        request: IlpRunRequest,
        progress: &mut dyn FnMut(IlpProgress),
        cancelled: &dyn Fn() -> bool,
    ) -> Result<IlpOptimizationOutcome, String> {
        if cancelled() {
            self.terminate()?;
            return Ok(IlpOptimizationOutcome::Cancelled);
        }
        let id = request.run_id.clone();
        protocol::write_frame(
            self.input.as_mut().ok_or_else(|| FAILURE.to_string())?,
            &request,
        )
        .map_err(|_| FAILURE.to_string())?;
        drop(request);
        loop {
            if cancelled() {
                self.terminate()?;
                // Retain validated progress already received before interruption.
                while let Ok(Ok(event)) = self.events.try_recv() {
                    if let IlpEvent::Progress {
                        run_id,
                        progress: update,
                    } = event
                    {
                        if run_id == id {
                            progress(update);
                        }
                    }
                }
                return Ok(IlpOptimizationOutcome::Cancelled);
            }
            match self.events.recv_timeout(Duration::from_millis(25)) {
                Ok(Ok(IlpEvent::Progress {
                    run_id,
                    progress: update,
                })) => {
                    if run_id == id {
                        progress(update);
                    }
                }
                Ok(Ok(IlpEvent::Finished { run_id, outcome })) => {
                    if run_id == id {
                        return Ok(outcome);
                    }
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                _ => {
                    self.terminate()?;
                    return Err(FAILURE.into());
                }
            }
        }
    }

    pub fn is_reusable(&mut self) -> bool {
        self.reusable && matches!(self.child.try_wait(), Ok(None))
    }

    fn terminate(&mut self) -> Result<(), String> {
        self.reusable = false;
        self.reader_stop.store(true, Ordering::Relaxed);
        self.input.take();
        if self
            .child
            .try_wait()
            .map_err(|_| FAILURE.to_string())?
            .is_none()
        {
            if self.child.kill().is_err()
                && self
                    .child
                    .try_wait()
                    .map_err(|_| FAILURE.to_string())?
                    .is_none()
            {
                return Err(FAILURE.into());
            }
        }
        self.child.wait().map_err(|_| FAILURE.to_string())?;
        if let Some(reader) = self.reader.take() {
            let _ = reader.join();
        }
        Ok(())
    }
}

impl Drop for NativeIlpWorker {
    fn drop(&mut self) {
        let _ = self.terminate();
    }
}

#[cfg(test)]
mod tests;
