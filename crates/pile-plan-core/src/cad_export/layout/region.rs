use super::{text_rect, text_width, LabelLayout, LabelPosition, Point, Rect, Segment, DIRECTIONS};

const SCAN_STEPS: u32 = 24;

impl LabelLayout {
    pub fn place_region<'a>(
        &mut self,
        value: &'a str,
        key: &'a str,
        height: f64,
        rings: &[Vec<Point>],
    ) -> Option<(&'a str, LabelPosition)> {
        let bounds = Rect::from_points(rings.first()?.iter().copied());
        let edges: Vec<Segment> = rings
            .iter()
            .flat_map(|ring| {
                ring.iter()
                    .copied()
                    .zip(ring.iter().copied().cycle().skip(1))
            })
            .collect();
        let step = [
            (bounds.max[0] - bounds.min[0]) / f64::from(SCAN_STEPS),
            (bounds.max[1] - bounds.min[1]) / f64::from(SCAN_STEPS),
        ];
        if step[0] <= 0. || step[1] <= 0. {
            return None;
        }

        // Scan each filled span. Sampling only a regular grid could miss
        // a narrow branch of a polygon or a strip along a hole.
        let mut samples = Vec::new();
        for row in 0..SCAN_STEPS {
            let y = bounds.min[1] + (f64::from(row) + 0.5) * step[1];
            let mut xs: Vec<_> = edges
                .iter()
                .filter_map(|&edge| crossing_x(edge, y))
                .collect();
            xs.sort_by(f64::total_cmp);
            for span in xs.chunks_exact(2) {
                let width = span[1] - span[0];
                let count = (width / step[0]).ceil() as u32;
                for col in 0..count {
                    let x = span[0] + (f64::from(col) + 0.5) / f64::from(count) * width;
                    samples.push([x, y]);
                }
            }
        }

        let obstacles: Vec<_> = self
            .obstacles
            .iter()
            .chain(&self.text)
            .copied()
            .filter(|rect| rect.overlaps(bounds))
            .collect();
        let leaders: Vec<_> = self
            .leaders
            .iter()
            .copied()
            .filter(|line| bounds.intersects(*line))
            .collect();
        let best_center = |width: f64, height: f64| {
            let offset = text_rect([0., 0.], width, height).center();
            let rect_at = |[x, y]: Point| text_rect([x - offset[0], y - offset[1]], width, height);
            let mut best: Option<(Point, f64, f64)> = None;
            let center = bounds.center();
            let mut consider = |point: Point| {
                let rect = rect_at(point);
                let clearance = minimum_clearance(rect, &obstacles, &edges, &leaders);
                let distance_to_center = squared_distance(point, center);
                if clearance > 0.
                    && best.is_none_or(|(_, score, distance)| {
                        clearance > score || (clearance == score && distance_to_center < distance)
                    })
                {
                    best = Some((point, clearance, distance_to_center));
                }
                best
            };
            let mut best_result = None;
            for &point in &samples {
                best_result = consider(point);
            }
            // Refine the most open spot to within a fraction of a grid cell.
            for factor in [0.5, 0.25, 0.125, 0.0625] {
                let ([x, y], _, _) = best_result?;
                for [dx, dy] in DIRECTIONS {
                    let p = [x + dx * step[0] * factor, y + dy * step[1] * factor];
                    if edges
                        .iter()
                        .filter_map(|&edge| crossing_x(edge, p[1]))
                        .filter(|&x| x > p[0])
                        .count()
                        % 2
                        == 1
                    {
                        best_result = consider(p);
                    }
                }
            }
            best_result.map(|([x, y], _, _)| [x - offset[0], y - offset[1]])
        };
        for label in [value, key] {
            let width = text_width(label, height);
            if let Some(baseline) = best_center(width, height) {
                let rect = text_rect(baseline, width, height);
                return Some((label, self.reserve(baseline, rect, None)));
            }
        }
        let anchor = best_center(0., 0.)?;
        self.place_point_label(key, height, anchor, 0., None, true)
            .map(|position| (key, position))
    }
}

fn minimum_clearance(
    rect: Rect,
    obstacles: &[Rect],
    edges: &[Segment],
    leaders: &[Segment],
) -> f64 {
    let mut gap = f64::INFINITY;
    for obstacle in obstacles {
        let dx = (rect.min[0] - obstacle.max[0])
            .max(obstacle.min[0] - rect.max[0])
            .max(0.);
        let dy = (rect.min[1] - obstacle.max[1])
            .max(obstacle.min[1] - rect.max[1])
            .max(0.);
        gap = gap.min(dx * dx + dy * dy);
        if gap == 0. {
            return 0.;
        }
    }
    for &(a, b) in edges.iter().chain(leaders) {
        if rect.intersects((a, b)) {
            return 0.;
        }
        gap = gap
            .min(squared_distance(a, rect.closest(a)))
            .min(squared_distance(b, rect.closest(b)));
        // If the segment has no endpoint in the rectangle and misses its
        // interior, a nearest pair uses an endpoint or a rectangle corner.
        let [dx, dy] = [b[0] - a[0], b[1] - a[1]];
        let length = dx * dx + dy * dy;
        if length > 0. {
            for [x, y] in rect.corners() {
                let fraction = (((x - a[0]) * dx + (y - a[1]) * dy) / length).clamp(0., 1.);
                gap = gap.min(squared_distance(
                    [x, y],
                    [a[0] + fraction * dx, a[1] + fraction * dy],
                ));
            }
        }
    }
    gap
}

fn crossing_x(([x1, y1], [x2, y2]): Segment, y: f64) -> Option<f64> {
    ((y1 > y) != (y2 > y)).then(|| x1 + (x2 - x1) * (y - y1) / (y2 - y1))
}

fn squared_distance(a: Point, b: Point) -> f64 {
    let [dx, dy] = [a[0] - b[0], a[1] - b[1]];
    dx * dx + dy * dy
}

impl Rect {
    fn center(self) -> Point {
        [
            (self.min[0] + self.max[0]) / 2.,
            (self.min[1] + self.max[1]) / 2.,
        ]
    }
}
