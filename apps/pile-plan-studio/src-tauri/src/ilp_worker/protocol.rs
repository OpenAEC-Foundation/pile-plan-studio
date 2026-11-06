//! Named MessagePack maps preserve floats and skipped/optional DTO fields.
use serde::{de::DeserializeOwned, Serialize};
use std::io::{self, Read, Write};

const MAGIC: [u8; 8] = *b"OPPSILP1";

pub fn write_frame(output: &mut impl Write, value: &impl Serialize) -> io::Result<()> {
    let bytes = rmp_serde::to_vec_named(value).map_err(io::Error::other)?;
    output.write_all(&MAGIC)?;
    output.write_all(&(bytes.len() as u64).to_le_bytes())?;
    output.write_all(&bytes)?;
    output.flush()
}

pub fn read_frame<T: DeserializeOwned>(
    input: &mut impl Read,
    allow_preamble: bool,
) -> io::Result<T> {
    let mut magic = [0; 8];
    input.read_exact(&mut magic)?;
    if magic != MAGIC && allow_preamble {
        // An isolated test executable has a short test-harness preamble. A
        // bounded scan also tolerates startup diagnostics before the handshake.
        for _ in 0..4096 {
            magic.copy_within(1.., 0);
            input.read_exact(&mut magic[7..])?;
            if magic == MAGIC {
                break;
            }
        }
    }
    if magic != MAGIC {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Invalid optimizer worker protocol",
        ));
    }
    let mut length = [0; 8];
    input.read_exact(&mut length)?;
    let length = usize::try_from(u64::from_le_bytes(length)).map_err(io::Error::other)?;
    let mut bytes = Vec::new();
    bytes.try_reserve_exact(length).map_err(io::Error::other)?;
    bytes.resize(length, 0);
    input.read_exact(&mut bytes)?;
    rmp_serde::from_slice(&bytes).map_err(io::Error::other)
}
