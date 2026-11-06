"""Identify the delivered UI process independently of its launcher or solver."""


def is_application_process(executable, command_line, binary, *, portable=False,
                           pid=None, launched_pid=None):
    if not command_line or "--opps-ilp-worker" in command_line:
        return False
    if launched_pid is not None and pid != launched_pid:
        return False
    return ((executable.startswith("/tmp/.mount_") and
             executable.endswith("/usr/bin/pile-plan-studio"))
            if portable else executable == binary)
