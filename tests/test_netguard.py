import socket

import pytest

from privacy import netguard


@pytest.fixture
def guard():
    netguard.reset()
    netguard.install(("127.0.0.1", "localhost", "::1"))
    yield netguard
    netguard.uninstall()
    netguard.reset()


def test_outbound_is_blocked_and_counted(guard):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(1)
    with pytest.raises(OSError, match="SignalVault netguard: outbound connection to 1.1.1.1:80 blocked"):
        s.connect(("1.1.1.1", 80))
    with pytest.raises(OSError, match="netguard"):
        s.connect_ex(("1.1.1.1", 443))
    s.close()
    with pytest.raises(OSError, match="netguard"):
        socket.create_connection(("example.com", 80), timeout=1)
    with pytest.raises(OSError, match="netguard"):
        socket.getaddrinfo("example.com", 443)
    st = guard.status()
    assert st["installed"] and st["blocked"] == 4
    assert st["last_blocked"][:2] == ["1.1.1.1:80", "1.1.1.1:443"]
    assert st["allowed_hosts"] == ["127.0.0.1", "localhost", "::1"]


def test_loopback_is_allowed(guard):
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.bind(("127.0.0.1", 0))
    srv.listen(8)                                   # backlog for 3 un-accepted clients (Windows is strict)
    port = srv.getsockname()[1]
    try:
        c1 = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        c1.connect(("127.0.0.1", port))
        c2 = socket.create_connection(("127.0.0.1", port), timeout=2)
        c3 = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        assert c3.connect_ex(("127.0.0.1", port)) == 0
        assert c1.getpeername()[1] == port and c2.getpeername()[1] == port
        for c in (c1, c2, c3):
            c.close()
    finally:
        srv.close()
    socket.getaddrinfo("localhost", port)          # resolving loopback names is allowed too
    assert guard.status()["blocked"] == 0


def test_uninstall_restores_socket():
    original = socket.socket.connect
    netguard.install()
    assert socket.socket.connect is not original
    netguard.uninstall()
    assert socket.socket.connect is original and not netguard.status()["installed"]
