use super::table::{SourceTable, TableCell};
use std::collections::VecDeque;
use std::sync::{Arc, Mutex, OnceLock};

// Cache raw worksheet cells only. Mapping, scope and engineering validation always rerun.
pub(super) struct WorkbookCache {
    entries: VecDeque<Entry>,
    budget: usize,
    used: usize,
}
struct Entry {
    file_name: String,
    bytes: Vec<u8>,
    tables: Arc<Vec<SourceTable>>,
    weight: usize,
}
impl WorkbookCache {
    fn new(budget: usize) -> Self {
        Self {
            entries: VecDeque::new(),
            budget,
            used: 0,
        }
    }
    pub(super) fn get(&mut self, file_name: &str, bytes: &[u8]) -> Option<Arc<Vec<SourceTable>>> {
        let i = self
            .entries
            .iter()
            .position(|e| e.file_name == file_name && e.bytes == bytes)?;
        let entry = self.entries.remove(i)?;
        let tables = Arc::clone(&entry.tables);
        self.entries.push_back(entry);
        Some(tables)
    }
    pub(super) fn insert(&mut self, file_name: &str, bytes: &[u8], tables: Arc<Vec<SourceTable>>) {
        let weight = bytes.len()
            + tables
                .iter()
                .map(|t| {
                    t.rows
                        .iter()
                        .map(|r| {
                            r.cells.len() * std::mem::size_of::<TableCell>()
                                + r.cells
                                    .iter()
                                    .map(|c| {
                                        if let TableCell::Text(s) = c {
                                            s.capacity()
                                        } else {
                                            0
                                        }
                                    })
                                    .sum::<usize>()
                        })
                        .sum::<usize>()
                        + t.formula_cells.len() * 64
                })
                .sum::<usize>();
        if weight > self.budget {
            return;
        }
        if let Some(i) = self
            .entries
            .iter()
            .position(|e| e.file_name == file_name && e.bytes == bytes)
        {
            if let Some(e) = self.entries.remove(i) {
                self.used -= e.weight;
            }
        }
        while self.entries.len() >= 8 || self.used + weight > self.budget {
            let Some(e) = self.entries.pop_front() else {
                break;
            };
            self.used -= e.weight;
        }
        self.used += weight;
        self.entries.push_back(Entry {
            file_name: file_name.into(),
            bytes: bytes.to_vec(),
            tables,
            weight,
        });
    }
}
pub(super) fn cache() -> &'static Mutex<WorkbookCache> {
    static CACHE: OnceLock<Mutex<WorkbookCache>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(WorkbookCache::new(64 * 1024 * 1024)))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cached_cells_are_immutable_and_identity_includes_bytes_and_filename() {
        let mut c = WorkbookCache::new(4096);
        let table = SourceTable {
            file_name: "a".into(),
            sheet_name: Some("s".into()),
            rows: vec![super::super::table::SourceRow {
                number: 1,
                cells: vec![TableCell::Text("value".into())],
            }],
            formula_cells: Default::default(),
        };
        c.insert("a", b"original", Arc::new(vec![table]));
        assert!(c.get("a", b"changed").is_none());
        assert!(c.get("renamed", b"original").is_none());
        let mut result = c.get("a", b"original").unwrap().as_ref().clone();
        result[0].rows.clear();
        assert_eq!(c.get("a", b"original").unwrap()[0].rows.len(), 1);
    }
    #[test]
    fn cache_is_bounded_and_a_hit_keeps_the_recent_entry() {
        let mut c = WorkbookCache::new(80);
        for i in 0..4 {
            c.insert(&i.to_string(), &[i; 20], Arc::new(vec![]));
        }
        assert!(c.get("0", &[0; 20]).is_some());
        c.insert("4", &[4; 20], Arc::new(vec![]));
        assert!(c.get("1", &[1; 20]).is_none());
        assert!(c.get("0", &[0; 20]).is_some());
        c.insert("large", &[9; 101], Arc::new(vec![]));
        assert!(c.get("large", &[9; 101]).is_none());
        assert!(c.used <= 80);
    }
}
