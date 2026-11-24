mod font;

use super::{Point, LABEL_LEADERS, REGION_OUTLINE};
use flate2::{write::ZlibEncoder, Compression};
use font::PlotFont;
use opencaddocument::entities::hatch::BoundaryEdge;
use opencaddocument::entities::Entity;
use opencaddocument::{BoundingBox3D, Color, Document, EntityType, Error, Vector3};
use pdf_writer::{Content, Filter, Name, Pdf, Rect, Ref, Str};
use std::io::Write;

const POINTS_PER_MM: f64 = 72. / 25.4;
const PAGE_WIDTH: f64 = 1189. * POINTS_PER_MM;
const PAGE_HEIGHT: f64 = 841. * POINTS_PER_MM;
const MARGIN: f64 = 10. * POINTS_PER_MM;
const FONT: Name<'static> = Name(b"F1");

pub(super) fn plot(document: &Document) -> Result<Vec<u8>, Error> {
    // The generated drawing uses only one level of inserts: pile and CPT symbols.
    let entities: Vec<_> = document
        .model_space_entities()
        .flat_map(|entity| match entity {
            EntityType::Insert(insert) => insert.explode_from_document(document),
            entity => vec![entity.clone()],
        })
        .collect();
    let font = PlotFont::from_entities(&entities)?;
    let mut bounds = super::layout::Rect::from_points(
        entities
            .iter()
            .map(|entity| bounds(entity, &font))
            .collect::<Result<Vec<_>, _>>()?
            .into_iter()
            .flat_map(|b| [xy(b.min), xy(b.max)]),
    );
    let span = [bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1]];
    if span.iter().any(|value| !value.is_finite()) {
        return Err("Non-finite PDF plot extents".into());
    }
    // Use one scale for both axes and include the complete legend on the sheet.
    let scale = ((PAGE_WIDTH - 2. * MARGIN) / span[0].max(1.))
        .min((PAGE_HEIGHT - 2. * MARGIN) / span[1].max(1.));
    bounds.min[0] -= (PAGE_WIDTH / scale - span[0]) / 2.;
    bounds.min[1] -= (PAGE_HEIGHT / scale - span[1]) / 2.;
    let project = |[x, y]: Point| {
        [
            ((x - bounds.min[0]) * scale) as f32,
            ((y - bounds.min[1]) * scale) as f32,
        ]
    };

    let mut content = Content::new();
    for entity in &entities {
        match entity {
            EntityType::Line(line) => {
                let (gray, width) = if line.common.layer == LABEL_LEADERS {
                    (0.45, 0.38)
                } else {
                    (0., 0.55)
                };
                content.set_stroke_gray(gray).set_line_width(width);
                path(
                    &mut content,
                    [xy(line.start), xy(line.end)].into_iter().map(project),
                    false,
                );
                content.stroke();
            }
            EntityType::LwPolyline(line) => {
                let width = if line.common.layer == REGION_OUTLINE {
                    0.7
                } else {
                    0.55
                };
                content.set_stroke_gray(0.).set_line_width(width);
                path(
                    &mut content,
                    line.vertices
                        .iter()
                        .map(|v| project([v.location.x, v.location.y])),
                    line.is_closed,
                );
                content.stroke();
            }
            EntityType::Circle(circle) => {
                let [x, y] = project(xy(circle.center));
                let radius = (circle.radius * scale) as f32;
                let tangent = radius * 0.552_284_8;
                content
                    .set_stroke_gray(0.)
                    .set_line_width(0.55)
                    .move_to(x + radius, y)
                    .cubic_to(
                        x + radius,
                        y + tangent,
                        x + tangent,
                        y + radius,
                        x,
                        y + radius,
                    )
                    .cubic_to(
                        x - tangent,
                        y + radius,
                        x - radius,
                        y + tangent,
                        x - radius,
                        y,
                    )
                    .cubic_to(
                        x - radius,
                        y - tangent,
                        x - tangent,
                        y - radius,
                        x,
                        y - radius,
                    )
                    .cubic_to(
                        x + tangent,
                        y - radius,
                        x + radius,
                        y - tangent,
                        x + radius,
                        y,
                    )
                    .close_path()
                    .stroke();
            }
            EntityType::Hatch(fill) => {
                let rgb = match fill.common.color {
                    Color::Rgb { r, g, b } => [r, g, b].map(|channel| f32::from(channel) / 255.),
                    _ => [0.; 3],
                };
                content.set_fill_rgb(rgb[0], rgb[1], rgb[2]);
                for ring in &fill.paths {
                    let [BoundaryEdge::Polyline(edge)] = ring.edges.as_slice() else {
                        return Err("Unsupported PDF hatch boundary".into());
                    };
                    path(
                        &mut content,
                        edge.vertices.iter().map(|&p| project(xy(p))),
                        true,
                    );
                }
                content.fill_even_odd();
            }
            EntityType::Text(text) => {
                let size = font.size(text);
                let [x, y] = project(font.baseline(text));
                content
                    .set_fill_gray(0.)
                    .begin_text()
                    .set_font(FONT, (size * scale) as f32)
                    .next_line(x, y)
                    .show(Str(&font.encode(&text.value)))
                    .end_text();
            }
            _ => return Err("Unsupported entity in PDF plot".into()),
        }
    }

    let mut pdf = Pdf::new();
    let (catalog, pages, page, contents, font_ref) = (
        Ref::new(1),
        Ref::new(2),
        Ref::new(3),
        Ref::new(4),
        Ref::new(5),
    );
    pdf.catalog(catalog).pages(pages);
    pdf.pages(pages).kids([page]).count(1);
    pdf.page(page)
        .parent(pages)
        .media_box(Rect::new(0., 0., PAGE_WIDTH as f32, PAGE_HEIGHT as f32))
        .contents(contents)
        .resources()
        .fonts()
        .pair(FONT, font_ref);
    pdf.stream(contents, &compress(&content.finish())?)
        .filter(Filter::FlateDecode);
    font.embed(&mut pdf, font_ref)?;
    Ok(pdf.finish())
}

fn bounds(entity: &EntityType, font: &PlotFont) -> Result<BoundingBox3D, Error> {
    Ok(match entity {
        EntityType::Line(entity) => entity.bounding_box(),
        EntityType::LwPolyline(entity) => entity.bounding_box(),
        EntityType::Circle(entity) => entity.bounding_box(),
        EntityType::Hatch(entity) => entity.bounding_box(),
        EntityType::Text(entity) => font.bounds(entity),
        _ => return Err("Unsupported entity in PDF plot".into()),
    })
}

fn path(content: &mut Content, mut points: impl Iterator<Item = [f32; 2]>, closed: bool) {
    if let Some([x, y]) = points.next() {
        content.move_to(x, y);
        for [x, y] in points {
            content.line_to(x, y);
        }
        if closed {
            content.close_path();
        }
    }
}

fn xy(point: Vector3) -> Point {
    [point.x, point.y]
}

fn compress(bytes: &[u8]) -> std::io::Result<Vec<u8>> {
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::fast());
    encoder.write_all(bytes)?;
    encoder.finish()
}
