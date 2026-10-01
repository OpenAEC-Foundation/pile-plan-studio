#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum NumericParseError {
    InvalidNumber,
    NonFinite,
    NonInteger,
    OutOfRange,
}

pub(crate) fn parse_finite_number(value: &str) -> Result<f64, NumericParseError> {
    let number = value
        .parse::<f64>()
        .map_err(|_| NumericParseError::InvalidNumber)?;
    if !number.is_finite() {
        return Err(NumericParseError::NonFinite);
    }
    Ok(number)
}

pub(crate) fn parse_nonnegative_u32(value: &str) -> Result<u32, NumericParseError> {
    let number = parse_finite_number(value)?;
    if number < 0.0 || number > u32::MAX as f64 {
        return Err(NumericParseError::OutOfRange);
    }
    if number.fract().abs() > f64::EPSILON {
        return Err(NumericParseError::NonInteger);
    }
    Ok(number as u32)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finite_numbers_keep_original_parsing_and_signed_zero() {
        for text in ["0", "-0", "42", "1e3", "1.5", "-1", "4294967296"] {
            assert_eq!(
                parse_finite_number(text).unwrap().to_bits(),
                text.parse::<f64>().unwrap().to_bits()
            );
        }
        for text in ["", "abc", " 42 "] {
            assert_eq!(
                parse_finite_number(text),
                Err(NumericParseError::InvalidNumber)
            );
        }
        for text in ["NaN", "inf", "-inf"] {
            assert_eq!(parse_finite_number(text), Err(NumericParseError::NonFinite));
        }
    }

    #[test]
    fn integers_keep_the_inclusive_epsilon_and_u32_boundaries() {
        for (text, value) in [
            ("0", 0),
            ("-0", 0),
            ("42", 42),
            ("1e3", 1000),
            ("4294967295", u32::MAX),
            ("1.0000000000000002", 1),
        ] {
            assert_eq!(parse_nonnegative_u32(text), Ok(value), "{text}");
        }
        for text in ["1.5", "1.0000000000000004"] {
            assert_eq!(
                parse_nonnegative_u32(text),
                Err(NumericParseError::NonInteger)
            );
        }
        for text in ["-1", "4294967296"] {
            assert_eq!(
                parse_nonnegative_u32(text),
                Err(NumericParseError::OutOfRange)
            );
        }
        assert_eq!(
            parse_nonnegative_u32("NaN"),
            Err(NumericParseError::NonFinite)
        );
        assert_eq!(
            parse_nonnegative_u32("abc"),
            Err(NumericParseError::InvalidNumber)
        );
    }
}
