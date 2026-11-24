mod layout;
mod legend;
mod pdf;

use crate::{order_numbering_locations, NumberingPoint, PileMarkOptions};
use layout::{LabelLayout, LabelPosition, PointLabel, Rect};
use opencaddocument::entities::hatch::{BoundaryEdge, BoundaryPath, PolylineEdge};
use opencaddocument::entities::{
    Circle, Hatch, Insert, Line, LwPolyline, LwVertex, Text, TextHorizontalAlignment,
};
use opencaddocument::tables::{BlockRecord, Layer, TextStyle};
use opencaddocument::{
    Color, Document, Dwg, Dxf, DxfVersion, EntityType, Error, Format, Handle, Ifcx, Vector2,
    Vector3,
};
use serde::Deserialize;
use std::collections::{BTreeMap, HashSet};
use std::f64::consts::FRAC_PI_2;

type Point = [f64; 2];
const PILES: &str = "Piles";
const CPTS: &str = "CPTs";
const LABELS: &str = "Labels";
const REGION_FILL: &str = "Tip-level fills";
const REGION_OUTLINE: &str = "Tip-level outlines";
const REGION_LABELS: &str = "Tip-level labels";
const LEGEND: &str = "Legend";
const TEXT_STYLE: &str = "Pile Plan Text";
const LABEL_LEADERS: &str = "Label leaders";
// First choices follow Revit R1/R2/R3/R4 and their square equivalents.
// Keep this order aligned with the editor's automatic preview in cadQuadrants.ts.
const QUADRANT_PATTERNS: [u8; 16] = [2, 3, 10, 15, 7, 1, 6, 12, 9, 5, 8, 13, 11, 4, 14, 0];

struct PileSymbol {
    block: String,
    radius: f64,
    marker_radius: f64,
    count: usize,
    mark: Option<usize>,
}
const MILLIMETERS: i16 = 4;

#[derive(Debug, Deserialize)]
pub struct CadDrawing {
    pub project: String,
    pub plan: String,
    pub piles: Vec<CadPile>,
    pub cpts: Vec<CadPoint>,
    pub regions: Vec<CadRegion>,
    pub piles_label: String,
    pub regions_label: String,
    pub unassigned_label: String,
    #[serde(default)]
    pub legend: CadLegend,
    #[serde(default)]
    pub numbering: PileMarkOptions,
    #[serde(default)]
    pub options: CadExportOptions,
    #[serde(default)]
    pub viewer_symbols: Vec<CadViewerSymbol>,
}

#[derive(Debug, Deserialize)]
pub struct CadViewerSymbol {
    pub size_mm: u32,
    pub outline: Vec<Point>,
    pub fill: Vec<Point>,
}

impl CadDrawing {
    fn included_cpts(&self) -> &[CadPoint] {
        if self.options.include_cpts {
            &self.cpts
        } else {
            &[]
        }
    }

    fn included_regions(&self) -> &[CadRegion] {
        match self.options.region_display {
            CadRegionDisplay::Hidden => &[],
            _ => &self.regions,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(default)]
pub struct CadExportOptions {
    pub numbering: CadNumbering,
    pub include_cpts: bool,
    pub symbols: CadSymbols,
    pub number_size: CadNumberSize,
    pub region_display: CadRegionDisplay,
    pub quadrant_symbols: Vec<CadQuadrantSymbol>,
}

impl Default for CadExportOptions {
    fn default() -> Self {
        Self {
            numbering: CadNumbering::PileNumber,
            include_cpts: true,
            symbols: CadSymbols::Patterned,
            number_size: CadNumberSize::Automatic,
            region_display: CadRegionDisplay::Filled,
            quadrant_symbols: Vec::new(),
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct CadQuadrantSymbol {
    pub size_mm: u32,
    pub shape: CadShape,
    pub quadrants: u8,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CadNumbering {
    PileNumber,
    LocationNumber,
    None,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CadNumberSize {
    Automatic,
    Compact,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CadRegionDisplay {
    Filled,
    Outlines,
    Hidden,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CadSymbols {
    Patterned,
    Viewer,
}

#[derive(Debug, Default, Deserialize)]
pub struct CadLegend {
    pub title: String,
    pub mark: String,
    pub size: String,
    pub count: String,
    pub cpts: String,
}

#[derive(Debug, Deserialize)]
pub struct CadPile {
    pub id: u32,
    pub mark: Option<String>,
    pub position: Point,
    pub size_mm: Option<u32>,
    pub shape: CadShape,
}

#[derive(Debug, Deserialize)]
pub struct CadPoint {
    pub name: String,
    pub position: Point,
}

#[derive(Debug, Deserialize)]
pub struct CadRegion {
    pub label: String,
    pub color: [u8; 3],
    // Each area contains an exterior ring followed by its holes.
    pub areas: Vec<Vec<Vec<Point>>>,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum CadShape {
    Round,
    Square,
    Unassigned,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CadFormat {
    Ifccad,
    Dwg,
    Dxf,
    Pdf,
}

pub fn export_drawing(drawing: &CadDrawing, format: CadFormat) -> Result<Vec<u8>, Error> {
    let doc = build_document(drawing)?;
    let writer: &dyn Format = match format {
        CadFormat::Ifccad => &Ifcx,
        CadFormat::Dwg => &Dwg,
        CadFormat::Dxf => &Dxf,
        CadFormat::Pdf => return pdf::plot(&doc),
    };
    let (bytes, diagnostics) = writer.write(&doc)?;
    if let Some(loss) = diagnostics.first() {
        return Err(format!("{}: {}", writer.name(), loss.message).into());
    }
    Ok(bytes)
}

pub fn build_document(drawing: &CadDrawing) -> Result<Document, Error> {
    let mut doc = Document::with_version(DxfVersion::AC1032);
    let cpts = drawing.included_cpts();
    let regions = drawing.included_regions();
    let fill_regions = matches!(drawing.options.region_display, CadRegionDisplay::Filled);
    doc.header.insertion_units = MILLIMETERS;
    doc.header.measurement = 1;
    for layer in [
        PILES,
        CPTS,
        LABELS,
        REGION_FILL,
        REGION_OUTLINE,
        REGION_LABELS,
        LABEL_LEADERS,
        LEGEND,
    ] {
        if (layer == CPTS && cpts.is_empty())
            || (layer == LABELS && matches!(drawing.options.numbering, CadNumbering::None))
            || (layer == REGION_FILL && !fill_regions)
            || (matches!(layer, REGION_OUTLINE | REGION_LABELS)
                && matches!(drawing.options.region_display, CadRegionDisplay::Hidden))
        {
            continue;
        }
        let mut record = Layer::new(layer);
        if layer == LABEL_LEADERS {
            record.color = Color::Index(8);
        }
        record.handle = doc.allocate_handle();
        doc.layers.add(record)?;
    }

    let mut style = TextStyle::with_truetype(TEXT_STYLE, "Arial");
    style.handle = doc.allocate_handle();
    style.font_file = "arial.ttf".into();
    doc.text_styles.add(style)?;

    let mut sizes = BTreeMap::new();
    for pile in &drawing.piles {
        *sizes.entry((pile.shape, pile.size_mm)).or_insert(0) += 1;
    }
    let mut symbols = BTreeMap::new();
    let viewer_symbols: BTreeMap<_, _> = drawing
        .viewer_symbols
        .iter()
        .map(|symbol| (symbol.size_mm, symbol))
        .collect();
    let mut pattern_index = BTreeMap::new();
    let quadrant_symbols: BTreeMap<_, _> = drawing
        .options
        .quadrant_symbols
        .iter()
        .map(|symbol| ((symbol.shape, symbol.size_mm), symbol.quadrants))
        .collect();
    let mut next_mark = 1;
    for (&(shape, size), &count) in &sizes {
        let block = match (shape, size) {
            (CadShape::Round, Some(size)) => format!("PILE_ROUND_{size}"),
            (CadShape::Square, Some(size)) => format!("PILE_SQUARE_{size}"),
            _ => "PILE_UNASSIGNED".to_string(),
        };
        let radius = size.map_or(125., |size| f64::from(size) / 2.);
        let (mark, quadrants) = if shape == CadShape::Unassigned {
            (None, 0)
        } else {
            let index = pattern_index.entry(shape).or_insert(0);
            let default = QUADRANT_PATTERNS[*index % QUADRANT_PATTERNS.len()];
            let quadrants = match (drawing.options.symbols, size) {
                (CadSymbols::Patterned, Some(size)) => quadrant_symbols
                    .get(&(shape, size))
                    .copied()
                    .unwrap_or(default),
                _ => default,
            };
            if quadrants > 0b1111 {
                return Err("Invalid filled quadrant pattern".into());
            }
            *index += 1;
            let mark = next_mark;
            next_mark += 1;
            (Some(mark), quadrants)
        };
        let marker_radius = match (drawing.options.symbols, size, shape) {
            (CadSymbols::Viewer, Some(size), CadShape::Round | CadShape::Square) => {
                let geometry = viewer_symbols
                    .get(&size)
                    .ok_or_else(|| format!("Viewer symbol missing for {size} mm"))?;
                add_viewer_pile_block(&mut doc, &block, radius, geometry)?;
                radius
            }
            _ => {
                add_pile_block(&mut doc, &block, shape, radius, quadrants)?;
                1.45 * radius
            }
        };
        symbols.insert(
            (shape, size),
            PileSymbol {
                block,
                radius,
                marker_radius,
                count,
                mark,
            },
        );
    }
    if !cpts.is_empty() {
        add_cpt_block(&mut doc)?;
    }

    // Hatches come first so text and symbols draw above the zone fills.
    if fill_regions {
        for region in regions.iter().filter(|region| !region.areas.is_empty()) {
            let mut fill = Hatch::solid();
            fill.common.layer = REGION_FILL.into();
            let [r, g, b] = region.color;
            fill.common.color = Color::from_rgb(r, g, b);
            for area in &region.areas {
                for (index, ring) in area.iter().enumerate() {
                    fill.add_path(hatch_path(ring, index == 0));
                }
            }
            doc.add_entity(EntityType::Hatch(Box::new(fill)))?;
        }
    }
    for region in regions {
        for contour in region.areas.iter().flatten() {
            add_polyline(&mut doc, contour, true, REGION_OUTLINE, None)?;
        }
    }

    let bounds = Rect::from_points(
        drawing
            .piles
            .iter()
            .map(|p| p.position)
            .chain(cpts.iter().map(|p| p.position))
            .chain(
                regions
                    .iter()
                    .flat_map(|region| region.areas.iter().flatten().flatten().copied()),
            ),
    );
    // Reserve space for the legend within an A0 landscape plot. Model
    // geometry remains in original millimetres at 1:1.
    let unit = ((bounds.max[0] - bounds.min[0]) / 950.)
        .max((bounds.max[1] - bounds.min[1]) / 760.)
        .max(10.);
    let cpt_height = 2.5 * unit;
    let region_height = 3.2 * unit;
    let mut markers = Vec::with_capacity(drawing.piles.len() + cpts.len());
    for pile in &drawing.piles {
        let symbol = &symbols[&(pile.shape, pile.size_mm)];
        add_insert(&mut doc, &symbol.block, pile.position, PILES)?;
        markers.push(Rect::around(pile.position, symbol.marker_radius));
    }
    for cpt in cpts {
        add_insert(&mut doc, "CPT", cpt.position, CPTS)?;
        markers.push(Rect::around(cpt.position, 245.));
    }
    let boundaries = regions
        .iter()
        .flat_map(|region| region.areas.iter().flatten())
        .flat_map(|ring| {
            ring.iter()
                .copied()
                .zip(ring.iter().copied().cycle().skip(1))
        })
        .collect();
    let mut labels = LabelLayout::new(bounds, unit, markers, boundaries);
    let marks = pile_marks(drawing)?;
    let pile_labels: Vec<_> = drawing
        .piles
        .iter()
        .zip(&marks)
        .enumerate()
        .filter_map(|(index, (pile, mark))| {
            Some(PointLabel {
                value: mark.as_deref()?,
                anchor: pile.position,
                radius: symbols[&(pile.shape, pile.size_mm)].marker_radius,
                obstacle: index,
            })
        })
        .collect();
    for (label, position) in pile_labels
        .iter()
        .zip(labels.place_piles(&pile_labels, drawing.options.number_size))
    {
        if let Some((position, height)) = position {
            add_label(&mut doc, label.value, position, height, LABELS)?;
        }
    }
    for (index, cpt) in cpts.iter().enumerate() {
        let obstacle = Some(drawing.piles.len() + index);
        if let Some(position) =
            labels.place_point(&cpt.name, cpt_height, cpt.position, 245., obstacle)
        {
            add_label(&mut doc, &cpt.name, position, cpt_height, CPTS)?;
        }
    }
    for (index, region) in regions.iter().enumerate() {
        let key = format!("Z{}", index + 1);
        for area in &region.areas {
            if let Some((value, position)) =
                labels.place_region(&region.label, &key, region_height, area)
            {
                add_label(&mut doc, value, position, region_height, REGION_LABELS)?;
            }
        }
    }
    legend::draw(
        &mut doc,
        drawing,
        &symbols,
        labels.right_edge() + 14. * unit,
        bounds.max[1] + 8. * unit,
        unit,
    )?;
    Ok(doc)
}

fn pile_marks(drawing: &CadDrawing) -> Result<Vec<Option<String>>, Error> {
    match drawing.options.numbering {
        CadNumbering::None => return Ok(vec![None; drawing.piles.len()]),
        CadNumbering::LocationNumber => {
            return Ok(drawing
                .piles
                .iter()
                .map(|pile| Some(pile.id.to_string()))
                .collect());
        }
        CadNumbering::PileNumber => {}
    }
    let mut marks = vec![None; drawing.piles.len()];
    let mut unnumbered = vec![];
    let mut points = vec![];
    for (index, pile) in drawing.piles.iter().enumerate() {
        if pile.size_mm.is_none() {
            continue;
        }
        if let Some(mark) = pile.mark.as_deref().filter(|mark| !mark.trim().is_empty()) {
            marks[index] = Some(mark.to_string());
        } else {
            unnumbered.push(index);
            points.push(NumberingPoint {
                id: pile.id,
                x_mm: pile.position[0],
                y_mm: pile.position[1],
            });
        }
    }

    let reserved: HashSet<u32> = marks
        .iter()
        .flatten()
        .filter_map(|mark| mark.trim().parse().ok())
        .collect();
    let order = order_numbering_locations(&points, &drawing.numbering.rule)
        .map_err(|error| Error::from(error.to_string()))?;
    let start = drawing.numbering.start;
    if !order.is_empty() && start == 0 {
        return Err("invalid_mark_start".into());
    }
    let mut available = (start..=u32::MAX).filter(|mark| !reserved.contains(mark));
    for index in order {
        let mark = available.next().ok_or("mark_overflow")?;
        marks[unnumbered[index]] = Some(mark.to_string());
    }
    Ok(marks)
}

fn hatch_path(ring: &[Point], outside: bool) -> BoundaryPath {
    let mut path = if outside {
        BoundaryPath::external()
    } else {
        BoundaryPath::new()
    };
    path.add_edge(BoundaryEdge::Polyline(PolylineEdge::new(
        ring.iter().map(|&[x, y]| Vector2::new(x, y)).collect(),
        true,
    )));
    path
}

fn new_block(doc: &mut Document, name: &str) -> Result<Handle, Error> {
    let mut record = BlockRecord::new(name);
    record.handle = doc.allocate_handle();
    record.block_entity_handle = doc.allocate_handle();
    record.block_end_handle = doc.allocate_handle();
    record.units = MILLIMETERS;
    let handle = record.handle;
    doc.block_records.add(record)?;
    Ok(handle)
}

fn add_pile_block(
    doc: &mut Document,
    name: &str,
    shape: CadShape,
    r: f64,
    quadrants: u8,
) -> Result<(), Error> {
    let owner = new_block(doc, name)?;
    match shape {
        CadShape::Square => {
            add_polyline(
                doc,
                &[[-r, -r], [r, -r], [r, r], [-r, r]],
                true,
                "0",
                Some(owner),
            )?;
        }
        CadShape::Round => {
            let mut circle = Circle::from_center_radius(Vector3::ZERO, r);
            circle.common.owner_handle = owner;
            doc.add_entity(EntityType::Circle(circle))?;
        }
        CadShape::Unassigned => {}
    }
    for quadrant in 0..4 {
        if quadrants & (1 << quadrant) == 0 {
            continue;
        }
        let points = match shape {
            CadShape::Square => {
                let (x, y) = [(r, r), (-r, r), (-r, -r), (r, -r)][quadrant];
                vec![[0., 0.], [x, 0.], [x, y], [0., y]]
            }
            CadShape::Round => {
                let mut points = vec![[0., 0.]];
                points.extend((0..=12).map(|step| {
                    let angle = FRAC_PI_2 * (quadrant as f64 + f64::from(step) / 12.);
                    [r * angle.cos(), r * angle.sin()]
                }));
                points
            }
            CadShape::Unassigned => continue,
        };
        let mut fill = Hatch::solid();
        fill.common.owner_handle = owner;
        fill.add_path(hatch_path(&points, true));
        doc.add_entity(EntityType::Hatch(Box::new(fill)))?;
    }
    let crosshair = r * 1.45;
    for (start, end) in [
        ([-crosshair, 0.], [crosshair, 0.]),
        ([0., -crosshair], [0., crosshair]),
    ] {
        let mut line = Line::from_points(point_3d(start), point_3d(end));
        line.common.owner_handle = owner;
        doc.add_entity(EntityType::Line(line))?;
    }
    Ok(())
}

fn add_viewer_pile_block(
    doc: &mut Document,
    block: &str,
    radius: f64,
    symbol: &CadViewerSymbol,
) -> Result<(), Error> {
    if [&symbol.outline, &symbol.fill].iter().any(|ring| {
        ring.len() < 3
            || ring
                .iter()
                .flatten()
                .any(|coordinate| !coordinate.is_finite() || coordinate.abs() > 1.000_001)
    }) {
        return Err("Invalid viewer symbol geometry".into());
    }
    let owner = new_block(doc, block)?;
    let scale = |points: &[Point]| {
        points
            .iter()
            .map(|&[x, y]| [radius * x, radius * y])
            .collect::<Vec<_>>()
    };
    let mut fill = Hatch::solid();
    fill.common.owner_handle = owner;
    fill.add_path(hatch_path(&scale(&symbol.fill), true));
    doc.add_entity(EntityType::Hatch(Box::new(fill)))?;
    add_polyline(doc, &scale(&symbol.outline), true, "0", Some(owner))
}

fn add_cpt_block(doc: &mut Document) -> Result<(), Error> {
    let owner = new_block(doc, "CPT")?;
    let mut triangle = Hatch::solid();
    triangle.common.owner_handle = owner;
    triangle.add_path(hatch_path(
        &[[-210., 125.], [0., -245.], [210., 125.]],
        true,
    ));
    doc.add_entity(EntityType::Hatch(Box::new(triangle)))?;
    Ok(())
}

fn add_polyline(
    doc: &mut Document,
    vertices: &[Point],
    closed: bool,
    layer: &str,
    owner: Option<Handle>,
) -> Result<(), Error> {
    let mut line = LwPolyline::new();
    line.is_closed = closed;
    line.common.layer = layer.into();
    if let Some(owner) = owner {
        line.common.owner_handle = owner;
    }
    line.vertices = vertices
        .iter()
        .take(
            vertices.len()
                - usize::from(closed && vertices.first() == vertices.last() && vertices.len() > 1),
        )
        .map(|&[x, y]| LwVertex::from_coords(x, y))
        .collect();
    doc.add_entity(EntityType::LwPolyline(line))?;
    Ok(())
}

fn add_insert(doc: &mut Document, block: &str, at: Point, layer: &str) -> Result<(), Error> {
    add_insert_at_scale(doc, block, at, 1., layer)
}

fn add_insert_at_scale(
    doc: &mut Document,
    block: &str,
    at: Point,
    scale: f64,
    layer: &str,
) -> Result<(), Error> {
    let mut insert = Insert::new(block, point_3d(at));
    insert.common.layer = layer.into();
    insert.set_x_scale(scale);
    insert.set_y_scale(scale);
    doc.add_entity(EntityType::Insert(insert))?;
    Ok(())
}

fn add_line(doc: &mut Document, start: Point, end: Point, layer: &str) -> Result<(), Error> {
    let mut line = Line::from_points(point_3d(start), point_3d(end));
    line.common.layer = layer.into();
    doc.add_entity(EntityType::Line(line))?;
    Ok(())
}

fn add_label(
    doc: &mut Document,
    label: &str,
    position: LabelPosition,
    height: f64,
    layer: &str,
) -> Result<(), Error> {
    if let Some((start, end)) = position.leader {
        add_line(doc, start, end, LABEL_LEADERS)?;
    }
    add_text_with_alignment(
        doc,
        label,
        position.baseline,
        height,
        layer,
        position.centered,
    )
}

fn add_text(
    doc: &mut Document,
    value: &str,
    at: Point,
    height: f64,
    layer: &str,
) -> Result<(), Error> {
    add_text_with_alignment(doc, value, at, height, layer, false)
}

fn add_text_with_alignment(
    doc: &mut Document,
    value: &str,
    at: Point,
    height: f64,
    layer: &str,
    centered: bool,
) -> Result<(), Error> {
    let value: String = value
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect();
    if !value.trim().is_empty() {
        let mut text = Text::with_value(value, point_3d(at)).with_height(height);
        if centered {
            text.horizontal_alignment = TextHorizontalAlignment::Center;
            text.alignment_point = Some(text.insertion_point);
        }
        text.common.layer = layer.into();
        text.style = TEXT_STYLE.into();
        doc.add_entity(EntityType::Text(text))?;
    }
    Ok(())
}

fn point_3d([x, y]: Point) -> Vector3 {
    Vector3::new(x, y, 0.)
}
