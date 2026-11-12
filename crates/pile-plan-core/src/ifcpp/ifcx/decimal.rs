use serde_json::{json, Value};

use super::{invalid, Result};

/// Retain the decimal token until conversion to the signed millimetre key.
pub(super) fn read(value: &Value) -> Result<i64> {
    let token = token(value).ok_or_else(|| invalid("expected tip level as a decimal number"))?;
    let (negative, magnitude) = token
        .strip_prefix('-')
        .map_or((false, token), |n| (true, n));
    let (whole, fraction) = magnitude.split_once('.').unwrap_or((magnitude, ""));
    let parse = || {
        if fraction.len() > 3 || !fraction.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
        let whole = whole.parse::<i128>().ok()?;
        let fraction_mm = if fraction.is_empty() {
            0
        } else {
            fraction.parse::<i128>().ok()? * 10_i128.pow(3 - fraction.len() as u32)
        };
        let mm = whole.checked_mul(1000)?.checked_add(fraction_mm)?;
        i64::try_from(if negative { -mm } else { mm }).ok()
    };
    parse().ok_or_else(|| invalid(format!("invalid whole-millimetre tip level {token}")))
}

pub(super) fn write(mm: i64) -> Value {
    let sign = if mm < 0 { "-" } else { "" };
    let magnitude = mm.unsigned_abs();
    let mut token = format!("{sign}{}", magnitude / 1000);
    if magnitude % 1000 != 0 {
        let fraction = format!("{:03}", magnitude % 1000);
        token.push('.');
        token.push_str(fraction.trim_end_matches('0'));
    }
    mark(&token)
}

pub(super) fn metres(mm: i64) -> f64 {
    if mm.unsigned_abs() <= crate::pile_tip_levels::MAX_EXACT_INTEGER_MM as u64 {
        crate::pile_tip_level_m(mm)
    } else {
        token(&write(mm))
            .unwrap()
            .parse()
            .expect("all i64 millimetres fit in f64 metres")
    }
}

// This representation is private to the IFCX attribute tree. The Serde
// adapter writes the marked value as a JSON number and recognizes only raw
// number tokens from the precision-bearing fields when reading.
const DECIMAL: &str = "$ifcppDecimal";

fn mark(number: &str) -> Value {
    json!({DECIMAL: number})
}

pub(super) fn token(value: &Value) -> Option<&str> {
    value
        .as_object()
        .filter(|fields| fields.len() == 1)?
        .get(DECIMAL)?
        .as_str()
}

pub(super) mod attributes {
    use std::collections::BTreeMap;

    use serde::ser::{SerializeMap, SerializeSeq};
    use serde::{Deserialize, Deserializer, Serialize, Serializer};
    use serde_json::{value::RawValue, Map, Value};

    use super::{mark, token};

    pub fn deserialize<'de, D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Map<String, Value>, D::Error> {
        let attributes = BTreeMap::<String, Box<RawValue>>::deserialize(deserializer)?;
        attributes
            .into_iter()
            .map(|(name, raw)| {
                let value = if matches!(
                    name.as_str(),
                    super::super::graph::PILE
                        | super::super::graph::ADVICE
                        | "openaec::opps::legacyAssignments"
                        | "openaec::opps::planSettings"
                        | "openaec::opps::legend"
                        | "openaec::opps::pileCapProposals"
                        | "openaec::opps::optimizerSettings"
                        | "openaec::opps::optimizerResult"
                ) {
                    decode(&raw, LevelField::Nested)
                } else {
                    serde_json::from_str(raw.get())
                }
                .map_err(serde::de::Error::custom)?;
                Ok((name, value))
            })
            .collect()
    }

    #[derive(Clone, Copy)]
    enum LevelField {
        Nested,
        Number,
        ActiveLevels,
        LegendLevels,
        LegendEntry,
    }

    fn decode(raw: &RawValue, field: LevelField) -> serde_json::Result<Value> {
        let text = raw.get();
        if matches!(field, LevelField::Number)
            && text
                .as_bytes()
                .first()
                .is_some_and(|b| *b == b'-' || b.is_ascii_digit())
        {
            return Ok(mark(text));
        }
        match text.as_bytes().first() {
            Some(b'{') => {
                let fields: BTreeMap<String, &RawValue> = serde_json::from_str(text)?;
                fields
                    .into_iter()
                    .map(|(key, value)| {
                        let next = match (key.as_str(), field) {
                            ("tipLevel", _) | ("value", LevelField::LegendEntry) => {
                                LevelField::Number
                            }
                            ("activeTipLevels", _) => LevelField::ActiveLevels,
                            ("pileTipLevels", _) => LevelField::LegendLevels,
                            _ => LevelField::Nested,
                        };
                        // Treat a literal marker supplied by a file as invalid data.
                        if key == super::DECIMAL {
                            return Err(<serde_json::Error as serde::de::Error>::custom(
                                "invalid IFCX decimal token",
                            ));
                        }
                        Ok((key, decode(value, next)?))
                    })
                    .collect::<serde_json::Result<Map<_, _>>>()
                    .map(Value::Object)
            }
            Some(b'[') => {
                let items: Vec<&RawValue> = serde_json::from_str(text)?;
                let next = match field {
                    LevelField::ActiveLevels => LevelField::Number,
                    LevelField::LegendLevels => LevelField::LegendEntry,
                    _ => LevelField::Nested,
                };
                items
                    .into_iter()
                    .map(|item| decode(item, next))
                    .collect::<serde_json::Result<Vec<_>>>()
                    .map(Value::Array)
            }
            _ => serde_json::from_str(text),
        }
    }

    pub fn serialize<S: Serializer>(
        attributes: &Map<String, Value>,
        serializer: S,
    ) -> Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(Some(attributes.len()))?;
        for (key, value) in attributes {
            map.serialize_entry(key, &Attribute(value))?;
        }
        map.end()
    }

    struct Attribute<'a>(&'a Value);

    impl Serialize for Attribute<'_> {
        fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
            if let Some(number) = token(self.0) {
                let raw =
                    RawValue::from_string(number.to_owned()).map_err(serde::ser::Error::custom)?;
                return raw.serialize(serializer);
            }
            match self.0 {
                Value::Object(fields) => serialize(fields, serializer),
                Value::Array(items) => {
                    let mut sequence = serializer.serialize_seq(Some(items.len()))?;
                    for item in items {
                        sequence.serialize_element(&Attribute(item))?;
                    }
                    sequence.end()
                }
                scalar => scalar.serialize(serializer),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preserves_adjacent_keys_and_signed_endpoints() {
        for (mm, token) in [
            (9_007_199_254_740_990, "9007199254740.99"),
            (9_007_199_254_740_991, "9007199254740.991"),
            (i64::MIN, "-9223372036854775.808"),
            (i64::MAX, "9223372036854775.807"),
            (-1, "-0.001"),
            (0, "0"),
        ] {
            assert_eq!(super::token(&write(mm)), Some(token));
            assert_eq!(read(&mark(token)).unwrap(), mm);
        }
        for token in [
            "0.0001",
            "1e3",
            "9223372036854775.808",
            "-9223372036854775.809",
        ] {
            assert!(read(&mark(token)).is_err(), "{token}");
        }
    }
}
