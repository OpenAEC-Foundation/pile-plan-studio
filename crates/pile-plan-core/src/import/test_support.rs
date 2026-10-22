pub(super) fn capacity_workbook() -> Vec<u8> {
    let mut workbook = rust_xlsxwriter::Workbook::new();
    let sheet = workbook.add_worksheet();
    for (column, value) in [61., -18.5, 290., 700.].iter().enumerate() {
        sheet.write_number(0, column as u16, *value).unwrap();
    }
    workbook.save_to_buffer().unwrap()
}
