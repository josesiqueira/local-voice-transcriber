"""Stops this process from using the network, enforced by the Linux kernel.

install() adds a seccomp filter, the kernel feature behind systemd's RestrictAddressFamilies=.
After it, socket() fails with EACCES for every address family except AF_UNIX (local sockets,
used by the NVIDIA driver) and AF_NETLINK (kernel queries, never leaves the computer), and
io_uring, which can create sockets without calling socket(), is refused. The filter covers all
threads, including those of native libraries, is inherited by child processes and cannot be
removed. No root rights are needed. Linux on x86_64 only.
"""

import ctypes
import errno
import os
import platform
import struct

_PR_SET_NO_NEW_PRIVS = 38
_NR_SECCOMP = 317  # x86_64
_SECCOMP_SET_MODE_FILTER = 1
_SECCOMP_FILTER_FLAG_TSYNC = 1  # apply to every thread of the process

_AUDIT_ARCH_X86_64 = 0xC000003E
_X32_SYSCALL_BIT = 0x40000000
_NR_SOCKET = 41
_NR_IO_URING_SETUP = 425
_AF_UNIX = 1
_AF_NETLINK = 16

_RET_ALLOW = 0x7FFF0000
_RET_DENY = 0x00050000 | errno.EACCES  # SECCOMP_RET_ERRNO

# Classic BPF instructions: (code, jump if true, jump if false, k). Jumps skip that many
# instructions. Offsets read struct seccomp_data: nr at 0, arch at 4, args[0] at 16.
_LD, _JEQ, _JGE, _RET = 0x20, 0x15, 0x35, 0x06
_PROGRAM = [
    (_LD, 0, 0, 4),  # 0: arch
    (_JEQ, 0, 8, _AUDIT_ARCH_X86_64),  # 1: other ABIs -> deny
    (_LD, 0, 0, 0),  # 2: syscall number
    (_JGE, 6, 0, _X32_SYSCALL_BIT),  # 3: x32 ABI -> deny
    (_JEQ, 0, 3, _NR_SOCKET),  # 4: not socket() -> 8
    (_LD, 0, 0, 16),  # 5: address family
    (_JEQ, 2, 0, _AF_UNIX),  # 6: -> allow
    (_JEQ, 1, 2, _AF_NETLINK),  # 7: -> allow, else deny
    (_JEQ, 1, 0, _NR_IO_URING_SETUP),  # 8: -> deny, else allow
    (_RET, 0, 0, _RET_ALLOW),  # 9
    (_RET, 0, 0, _RET_DENY),  # 10
]


class NetworkBlockError(OSError):
    pass


_outcome = None  # None until tried, then True or the error


def ensure() -> None:
    """install() once per process; later calls repeat the first outcome."""
    global _outcome
    if _outcome is None:
        try:
            install()
            _outcome = True
        except OSError as exc:
            _outcome = exc
    if _outcome is not True:
        raise _outcome


def install() -> None:
    """Block network sockets for the rest of this process's life. Raises NetworkBlockError."""
    if platform.system() != "Linux" or platform.machine() != "x86_64":
        raise NetworkBlockError(f"network block supports Linux x86_64 only, not {platform.system()} {platform.machine()}")
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(_PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0:
        err = ctypes.get_errno()
        raise NetworkBlockError(err, f"prctl(PR_SET_NO_NEW_PRIVS) failed: {os.strerror(err)}")
    code = b"".join(struct.pack("=HBBI", *instruction) for instruction in _PROGRAM)
    buffer = ctypes.create_string_buffer(code, len(code))
    prog = struct.pack("=HxxxxxxQ", len(_PROGRAM), ctypes.addressof(buffer))  # struct sock_fprog
    prog_buffer = ctypes.create_string_buffer(prog, len(prog))
    libc.syscall.restype = ctypes.c_long
    result = libc.syscall(
        ctypes.c_long(_NR_SECCOMP),
        ctypes.c_long(_SECCOMP_SET_MODE_FILTER),
        ctypes.c_long(_SECCOMP_FILTER_FLAG_TSYNC),
        prog_buffer,
    )
    if result != 0:
        err = ctypes.get_errno()
        raise NetworkBlockError(err, f"seccomp filter failed (result {result}): {os.strerror(err)}")
