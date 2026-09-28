#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_browser_origin_before_dispatch() {
        let request = GuardedRequest::post("/mcp").origin("https://example.test");
        assert_eq!(
            validate_request(&request, "secret"),
            Err(BridgeError::Forbidden)
        );
    }

    #[test]
    fn requires_exact_bearer_token_and_json_post() {
        assert_eq!(
            validate_request(&GuardedRequest::post("/mcp"), "secret"),
            Err(BridgeError::Unauthorized)
        );
        assert_eq!(
            validate_request(&GuardedRequest::post("/mcp").bearer("secret"), "secret"),
            Ok(())
        );
        assert_eq!(
            validate_request(&GuardedRequest::get("/mcp").bearer("secret"), "secret"),
            Err(BridgeError::MethodNotAllowed)
        );
    }

    #[test]
    fn keeps_endpoint_stable_but_rotates_access_token() {
        let first = new_connection().unwrap();
        let second = new_connection().unwrap();
        assert_eq!(first.endpoint, "http://127.0.0.1:46537/mcp");
        assert_eq!(first.endpoint, second.endpoint);
        assert_ne!(first.token, second.token);
    }

    #[test]
    fn accepts_bulk_request_body_limit() {
        assert_eq!(MAX_REQUEST_BYTES, 256 * 1024);
    }

    #[test]
    fn rejected_request_consumes_bounded_body_before_responding() {
        use std::net::Shutdown;

        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let mut client = TcpStream::connect(("127.0.0.1", port)).unwrap();
        let body = "x".repeat(8192);
        let request = format!(
            "POST /mcp HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{body}",
            body.len()
        );
        client.write_all(request.as_bytes()).unwrap();
        client.shutdown(Shutdown::Write).unwrap();

        let (mut server, _) = listener.accept().unwrap();
        assert_eq!(read_request(&mut server, port, "secret"), Err(BridgeError::Unauthorized));
        let mut unread = Vec::new();
        server.read_to_end(&mut unread).unwrap();
        assert!(unread.is_empty(), "rejected request left unread body bytes");
    }

    #[test]
    fn accepts_another_request_while_one_handler_is_waiting() {
        use std::sync::Condvar;

        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        listener.set_nonblocking(true).unwrap();
        let address = listener.local_addr().unwrap();
        let running = Arc::new(AtomicBool::new(true));
        let gate = Arc::new((Mutex::new(false), Condvar::new()));
        let (first_tx, first_rx) = mpsc::channel();
        let (second_tx, second_rx) = mpsc::channel();
        let server_running = Arc::clone(&running);
        let server_gate = Arc::clone(&gate);
        let server = thread::spawn(move || {
            accept_connections(
                listener,
                || server_running.load(Ordering::SeqCst),
                move |mut stream| {
                    let mut id = [0_u8; 1];
                    stream.read_exact(&mut id).unwrap();
                    if id[0] == b'1' {
                        first_tx.send(()).unwrap();
                        let (lock, wake) = &*server_gate;
                        let mut release = lock.lock().unwrap();
                        while !*release {
                            release = wake.wait(release).unwrap();
                        }
                    } else {
                        second_tx.send(()).unwrap();
                    }
                },
            );
        });
        let mut first = TcpStream::connect(address).unwrap();
        first.write_all(b"1").unwrap();
        first_rx.recv_timeout(Duration::from_secs(1)).unwrap();
        let mut second = TcpStream::connect(address).unwrap();
        second.write_all(b"2").unwrap();
        let accepted_while_first_waited = second_rx.recv_timeout(Duration::from_secs(1)).is_ok();
        let (lock, wake) = &*gate;
        *lock.lock().unwrap() = true;
        wake.notify_all();
        running.store(false, Ordering::SeqCst);
        server.join().unwrap();
        assert!(accepted_while_first_waited);
    }
}
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Listener, State};

const MAX_HEADER_BYTES: usize = 8192;
const MAX_REQUEST_BYTES: usize = 256 * 1024;
const MAX_RESPONSE_BYTES: usize = 1024 * 1024;
const MAX_IN_FLIGHT_CONNECTIONS: usize = 16;
const REQUEST_EVENT: &str = "mcp://request";
const RESPONSE_EVENT: &str = "mcp://response";
const MCP_PORT: u16 = 46537;

#[derive(Debug, PartialEq, Eq)]
enum BridgeError {
    Forbidden,
    Unauthorized,
    MethodNotAllowed,
    BadRequest,
    TooLarge,
    Unavailable,
    Timeout,
}

impl BridgeError {
    fn status(&self) -> u16 {
        match self {
            Self::Forbidden => 403,
            Self::Unauthorized => 401,
            Self::MethodNotAllowed => 405,
            Self::BadRequest => 400,
            Self::TooLarge => 413,
            Self::Unavailable => 503,
            Self::Timeout => 504,
        }
    }
}

#[derive(Debug)]
struct GuardedRequest {
    method: String,
    path: String,
    origin: Option<String>,
    authorization: Option<String>,
    content_type: Option<String>,
    protocol_version: Option<String>,
}

#[cfg(test)]
impl GuardedRequest {
    fn post(path: &str) -> Self {
        Self {
            method: "POST".into(),
            path: path.into(),
            origin: None,
            authorization: None,
            content_type: Some("application/json".into()),
            protocol_version: None,
        }
    }

    fn get(path: &str) -> Self {
        Self {
            method: "GET".into(),
            ..Self::post(path)
        }
    }
    fn origin(mut self, value: &str) -> Self {
        self.origin = Some(value.into());
        self
    }
    fn bearer(mut self, value: &str) -> Self {
        self.authorization = Some(format!("Bearer {value}"));
        self
    }
}

fn constant_time_equal(left: &str, right: &str) -> bool {
    if left.len() != right.len() {
        return false;
    }
    let mut difference = 0_u8;
    for (a, b) in left.bytes().zip(right.bytes()) {
        difference |= a ^ b;
    }
    difference == 0
}

fn validate_request(request: &GuardedRequest, token: &str) -> Result<(), BridgeError> {
    if request.origin.is_some() {
        return Err(BridgeError::Forbidden);
    }
    if request.path != "/mcp" {
        return Err(BridgeError::BadRequest);
    }
    if request.method != "POST" {
        return Err(BridgeError::MethodNotAllowed);
    }
    if request.content_type.as_deref().is_none_or(|value| {
        !value
            .split(';')
            .next()
            .unwrap_or("")
            .trim()
            .eq_ignore_ascii_case("application/json")
    }) {
        return Err(BridgeError::BadRequest);
    }
    if request
        .protocol_version
        .as_deref()
        .is_some_and(|value| value != "2025-11-25")
    {
        return Err(BridgeError::BadRequest);
    }
    let bearer = request
        .authorization
        .as_deref()
        .and_then(|value| value.strip_prefix("Bearer "));
    if bearer.is_none_or(|value| !constant_time_equal(value, token)) {
        return Err(BridgeError::Unauthorized);
    }
    Ok(())
}

#[derive(Clone, Serialize, Deserialize)]
struct WireMessage {
    id: String,
    body: String,
}

#[derive(Clone, Serialize)]
pub struct McpConnection {
    endpoint: String,
    token: String,
}

struct Session {
    connection: McpConnection,
    id_prefix: String,
    enabled: AtomicBool,
    next_id: AtomicU64,
    pending: Mutex<HashMap<String, mpsc::Sender<String>>>,
}

#[derive(Default)]
pub struct McpBridgeState {
    current: Arc<Mutex<Option<Arc<Session>>>>,
}

impl McpBridgeState {
    pub fn install_response_listener(&self, app: &AppHandle) {
        let current = Arc::clone(&self.current);
        app.listen(RESPONSE_EVENT, move |event| {
            let Ok(message) = serde_json::from_str::<WireMessage>(event.payload()) else {
                return;
            };
            let session = current
                .lock()
                .ok()
                .and_then(|guard| guard.as_ref().cloned());
            if let Some(session) = session {
                if !session.enabled.load(Ordering::SeqCst) {
                    return;
                }
                let sender = session
                    .pending
                    .lock()
                    .ok()
                    .and_then(|mut pending| pending.remove(&message.id));
                if let Some(sender) = sender {
                    let _ = sender.send(message.body);
                }
            }
        });
    }

    pub fn stop(&self) {
        if let Ok(mut current) = self.current.lock() {
            if let Some(session) = current.take() {
                session.enabled.store(false, Ordering::SeqCst);
                if let Ok(mut pending) = session.pending.lock() {
                    pending.clear();
                }
            }
        }
    }
}

fn random_token() -> Result<String, String> {
    let mut bytes = [0_u8; 32];
    getrandom::fill(&mut bytes).map_err(|_| "random_token_unavailable".to_string())?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn new_connection() -> Result<McpConnection, String> {
    Ok(McpConnection {
        endpoint: format!("http://127.0.0.1:{MCP_PORT}/mcp"),
        token: random_token()?,
    })
}

struct ConnectionPermit(Arc<AtomicUsize>);

impl Drop for ConnectionPermit {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::SeqCst);
    }
}

fn accept_connections(
    listener: TcpListener,
    active: impl Fn() -> bool,
    handle: impl Fn(TcpStream) + Send + Sync + 'static,
) {
    let handle = Arc::new(handle);
    let in_flight = Arc::new(AtomicUsize::new(0));
    while active() {
        match listener.accept() {
            Ok((mut stream, _)) => {
                if in_flight.fetch_add(1, Ordering::SeqCst) >= MAX_IN_FLIGHT_CONNECTIONS {
                    in_flight.fetch_sub(1, Ordering::SeqCst);
                    write_response(&mut stream, 503, "too_many_requests");
                    continue;
                }
                let permit = ConnectionPermit(Arc::clone(&in_flight));
                let handle = Arc::clone(&handle);
                thread::spawn(move || {
                    let _permit = permit;
                    handle(stream);
                });
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(25))
            }
            Err(_) => break,
        }
    }
}

#[tauri::command]
pub fn mcp_bridge_start(
    app: AppHandle,
    state: State<'_, McpBridgeState>,
) -> Result<McpConnection, String> {
    let mut current = state
        .current
        .lock()
        .map_err(|_| "bridge_unavailable".to_string())?;
    if let Some(session) = current.as_ref() {
        if session.enabled.load(Ordering::SeqCst) {
            return Ok(session.connection.clone());
        }
    }
    let listener = TcpListener::bind(("127.0.0.1", MCP_PORT))
        .map_err(|_| "loopback_bind_failed".to_string())?;
    listener
        .set_nonblocking(true)
        .map_err(|_| "loopback_bind_failed".to_string())?;
    let port = listener
        .local_addr()
        .map_err(|_| "loopback_bind_failed".to_string())?
        .port();
    let connection = new_connection()?;
    let session = Arc::new(Session {
        connection: connection.clone(),
        id_prefix: random_token()?,
        enabled: AtomicBool::new(true),
        next_id: AtomicU64::new(1),
        pending: Mutex::new(HashMap::new()),
    });
    *current = Some(Arc::clone(&session));
    let handler_session = Arc::clone(&session);
    thread::spawn(move || {
        accept_connections(
            listener,
            || session.enabled.load(Ordering::SeqCst),
            move |stream| handle_connection(stream, &app, &handler_session, port),
        );
        session.enabled.store(false, Ordering::SeqCst);
    });
    Ok(connection)
}

#[tauri::command]
pub fn mcp_bridge_stop(state: State<'_, McpBridgeState>) {
    state.stop();
}

fn read_request(stream: &mut TcpStream, port: u16, token: &str) -> Result<String, BridgeError> {
    let mut received = Vec::new();
    let header_end = loop {
        if received.len() > MAX_HEADER_BYTES {
            return Err(BridgeError::TooLarge);
        }
        let mut chunk = [0_u8; 1024];
        let count = stream
            .read(&mut chunk)
            .map_err(|_| BridgeError::BadRequest)?;
        if count == 0 {
            return Err(BridgeError::BadRequest);
        }
        received.extend_from_slice(&chunk[..count]);
        if let Some(end) = received.windows(4).position(|window| window == b"\r\n\r\n") {
            break end + 4;
        }
    };
    if header_end > MAX_HEADER_BYTES {
        return Err(BridgeError::TooLarge);
    }
    let headers =
        std::str::from_utf8(&received[..header_end]).map_err(|_| BridgeError::BadRequest)?;
    let mut lines = headers.split("\r\n");
    let first = lines.next().ok_or(BridgeError::BadRequest)?;
    let mut request_line = first.split_whitespace();
    let method = request_line
        .next()
        .ok_or(BridgeError::BadRequest)?
        .to_string();
    let path = request_line
        .next()
        .ok_or(BridgeError::BadRequest)?
        .to_string();
    if request_line.next() != Some("HTTP/1.1") {
        return Err(BridgeError::BadRequest);
    }
    let mut request = GuardedRequest {
        method,
        path,
        origin: None,
        authorization: None,
        content_type: None,
        protocol_version: None,
    };
    let mut length = None;
    let mut host = None;
    for line in lines.filter(|line| !line.is_empty()) {
        let (name, value) = line.split_once(':').ok_or(BridgeError::BadRequest)?;
        let value = value.trim();
        match name.trim().to_ascii_lowercase().as_str() {
            "origin" => request.origin = Some(value.to_string()),
            "authorization" => {
                if request.authorization.is_some() {
                    return Err(BridgeError::BadRequest);
                }
                request.authorization = Some(value.to_string());
            }
            "content-type" => {
                if request.content_type.is_some() {
                    return Err(BridgeError::BadRequest);
                }
                request.content_type = Some(value.to_string());
            }
            "mcp-protocol-version" => {
                if request.protocol_version.is_some() {
                    return Err(BridgeError::BadRequest);
                }
                request.protocol_version = Some(value.to_string());
            }
            "content-length" => {
                if length.is_some() {
                    return Err(BridgeError::BadRequest);
                }
                length = Some(
                    value
                        .parse::<usize>()
                        .map_err(|_| BridgeError::BadRequest)?,
                );
            }
            "transfer-encoding" => return Err(BridgeError::BadRequest),
            "host" => {
                if host.is_some() {
                    return Err(BridgeError::BadRequest);
                }
                host = Some(value.to_string());
            }
            _ => {}
        }
    }
    let length = length.ok_or(BridgeError::BadRequest)?;
    if length > MAX_REQUEST_BYTES {
        return Err(BridgeError::TooLarge);
    }
    // Consume bounded request content before rejecting it so clients receive the HTTP error.
    let mut body = received.split_off(header_end);
    if body.len() > length {
        return Err(BridgeError::BadRequest);
    }
    while body.len() < length {
        let mut chunk = [0_u8; 4096];
        let count = stream
            .read(&mut chunk)
            .map_err(|_| BridgeError::BadRequest)?;
        if count == 0 || body.len() + count > length {
            return Err(BridgeError::BadRequest);
        }
        body.extend_from_slice(&chunk[..count]);
    }
    let expected_host = format!("127.0.0.1:{port}");
    if host.as_deref() != Some(expected_host.as_str()) {
        return Err(BridgeError::Forbidden);
    }
    validate_request(&request, token)?;
    String::from_utf8(body).map_err(|_| BridgeError::BadRequest)
}

fn write_response(stream: &mut TcpStream, status: u16, body: &str) {
    let reason = match status {
        200 => "OK",
        202 => "Accepted",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        405 => "Method Not Allowed",
        413 => "Payload Too Large",
        503 => "Service Unavailable",
        504 => "Gateway Timeout",
        _ => "Error",
    };
    let content_type = if status == 200 {
        "application/json"
    } else {
        "text/plain"
    };
    let header = format!("HTTP/1.1 {status} {reason}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n", body.len());
    let _ = stream.write_all(header.as_bytes());
    let _ = stream.write_all(body.as_bytes());
}

fn handle_connection(mut stream: TcpStream, app: &AppHandle, session: &Arc<Session>, port: u16) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(3)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(3)));
    if !session.enabled.load(Ordering::SeqCst) {
        write_response(&mut stream, 503, "unavailable");
        return;
    }
    let body = match read_request(&mut stream, port, &session.connection.token) {
        Ok(body) => body,
        Err(error) => {
            write_response(&mut stream, error.status(), "request_rejected");
            return;
        }
    };
    let id = format!(
        "{}-{}",
        session.id_prefix,
        session.next_id.fetch_add(1, Ordering::SeqCst)
    );
    let (sender, receiver) = mpsc::channel();
    if let Ok(mut pending) = session.pending.lock() {
        pending.insert(id.clone(), sender);
    } else {
        write_response(&mut stream, 503, "unavailable");
        return;
    }
    if app
        .emit(
            REQUEST_EVENT,
            WireMessage {
                id: id.clone(),
                body,
            },
        )
        .is_err()
    {
        if let Ok(mut pending) = session.pending.lock() {
            pending.remove(&id);
        }
        write_response(&mut stream, 503, "unavailable");
        return;
    }
    let response = receiver.recv_timeout(Duration::from_secs(10));
    if let Ok(mut pending) = session.pending.lock() {
        pending.remove(&id);
    }
    if !session.enabled.load(Ordering::SeqCst) {
        write_response(&mut stream, 503, "unavailable");
        return;
    }
    match response {
        Ok(body) if body.len() > MAX_RESPONSE_BYTES => {
            write_response(&mut stream, 413, "response_too_large")
        }
        Ok(body) if body.is_empty() => write_response(&mut stream, 202, ""),
        Ok(body) => write_response(&mut stream, 200, &body),
        Err(mpsc::RecvTimeoutError::Timeout) => write_response(
            &mut stream,
            BridgeError::Timeout.status(),
            "request_timeout",
        ),
        Err(_) => write_response(
            &mut stream,
            BridgeError::Unavailable.status(),
            "unavailable",
        ),
    }
}
