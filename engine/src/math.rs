//! 2D Affine Transformation and Vector Math for hierarchical 2D sprite composition.

use serde::{Deserialize, Serialize};

/// 2D Point or Vector.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Vec2 {
    pub x: f32,
    pub y: f32,
}

impl Vec2 {
    pub const ZERO: Self = Self { x: 0.0, y: 0.0 };
    pub const ONE: Self = Self { x: 1.0, y: 1.0 };

    #[inline]
    pub const fn new(x: f32, y: f32) -> Self {
        Self { x, y }
    }

    #[inline]
    pub fn lerp(self, other: Self, t: f32) -> Self {
        Self {
            x: self.x + (other.x - self.x) * t,
            y: self.y + (other.y - self.y) * t,
        }
    }
}

/// 2D Affine transformation represented as a 3x3 matrix in column-major order:
/// [ a,  c,  tx ]
/// [ b,  d,  ty ]
/// [ 0,  0,  1  ]
/// where x' = a*x + c*y + tx, y' = b*x + d*y + ty
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Affine2D {
    pub a: f32,
    pub b: f32,
    pub c: f32,
    pub d: f32,
    pub tx: f32,
    pub ty: f32,
}

impl Default for Affine2D {
    fn default() -> Self {
        Self::IDENTITY
    }
}

impl Affine2D {
    pub const IDENTITY: Self = Self {
        a: 1.0,
        b: 0.0,
        c: 0.0,
        d: 1.0,
        tx: 0.0,
        ty: 0.0,
    };

    #[inline]
    pub const fn new(a: f32, b: f32, c: f32, d: f32, tx: f32, ty: f32) -> Self {
        Self { a, b, c, d, tx, ty }
    }

    #[inline]
    pub const fn translation(tx: f32, ty: f32) -> Self {
        Self {
            a: 1.0,
            b: 0.0,
            c: 0.0,
            d: 1.0,
            tx,
            ty,
        }
    }

    #[inline]
    pub fn rotation(radians: f32) -> Self {
        let (sin, cos) = radians.sin_cos();
        Self {
            a: cos,
            b: sin,
            c: -sin,
            d: cos,
            tx: 0.0,
            ty: 0.0,
        }
    }

    #[inline]
    pub const fn scale(sx: f32, sy: f32) -> Self {
        Self {
            a: sx,
            b: 0.0,
            c: 0.0,
            d: sy,
            tx: 0.0,
            ty: 0.0,
        }
    }

    /// Multiply two affine transforms: self * other.
    /// Applying (self * other).transform_point(p) is equivalent to self.transform_point(other.transform_point(p)).
    #[inline]
    pub fn mul(&self, other: &Self) -> Self {
        Self {
            a: self.a * other.a + self.c * other.b,
            b: self.b * other.a + self.d * other.b,
            c: self.a * other.c + self.c * other.d,
            d: self.b * other.c + self.d * other.d,
            tx: self.a * other.tx + self.c * other.ty + self.tx,
            ty: self.b * other.tx + self.d * other.ty + self.ty,
        }
    }

    /// Transform a 2D point (x, y) by this matrix.
    #[inline]
    pub fn transform_point(&self, p: Vec2) -> Vec2 {
        Vec2 {
            x: self.a * p.x + self.c * p.y + self.tx,
            y: self.b * p.x + self.d * p.y + self.ty,
        }
    }

    /// Construct a transform from translation, rotation (radians), scale, and pivot offset.
    /// The pivot (px, py) acts as the local origin for rotation and scaling.
    pub fn from_trs_pivot(translation: Vec2, rotation_rad: f32, scale: Vec2, pivot_offset: Vec2) -> Self {
        let (sin, cos) = rotation_rad.sin_cos();
        let a = cos * scale.x;
        let b = sin * scale.x;
        let c = -sin * scale.y;
        let d = cos * scale.y;

        // tx = translation.x - (a * pivot_offset.x + c * pivot_offset.y)
        // ty = translation.y - (b * pivot_offset.x + d * pivot_offset.y)
        let tx = translation.x - (a * pivot_offset.x + c * pivot_offset.y);
        let ty = translation.y - (b * pivot_offset.x + d * pivot_offset.y);

        Self { a, b, c, d, tx, ty }
    }

    /// Calculates determinant of 2x2 linear part.
    #[inline]
    pub fn determinant(&self) -> f32 {
        self.a * self.d - self.b * self.c
    }

    /// Invert the affine transformation. Returns None if determinant is zero.
    pub fn inverse(&self) -> Option<Self> {
        let det = self.determinant();
        if det.abs() < 1e-8 {
            return None;
        }
        let inv_det = 1.0 / det;
        let a = self.d * inv_det;
        let b = -self.b * inv_det;
        let c = -self.c * inv_det;
        let d = self.a * inv_det;

        let tx = -(a * self.tx + c * self.ty);
        let ty = -(b * self.tx + d * self.ty);

        Some(Self { a, b, c, d, tx, ty })
    }

    /// Exports as a flat array of 6 floats [a, b, c, d, tx, ty] compatible with HTML5 Canvas `setTransform(a, b, c, d, e, f)`.
    #[inline]
    pub fn to_array(&self) -> [f32; 6] {
        [self.a, self.b, self.c, self.d, self.tx, self.ty]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f32::consts::PI;

    #[test]
    fn identity_leaves_point_unchanged() {
        let p = Vec2::new(10.0, 20.0);
        let id = Affine2D::IDENTITY;
        assert_eq!(id.transform_point(p), p);
    }

    #[test]
    fn translation_moves_point() {
        let t = Affine2D::translation(5.0, -3.0);
        let p = Vec2::new(10.0, 20.0);
        let transformed = t.transform_point(p);
        assert_eq!(transformed, Vec2::new(15.0, 17.0));
    }

    #[test]
    fn rotation_90_deg() {
        let r = Affine2D::rotation(PI / 2.0);
        let p = Vec2::new(1.0, 0.0);
        let transformed = r.transform_point(p);
        assert!((transformed.x - 0.0).abs() < 1e-6);
        assert!((transformed.y - 1.0).abs() < 1e-6);
    }

    #[test]
    fn trs_with_pivot() {
        // Rotate 90 deg around pivot (10, 10), translated at (100, 100)
        let trs = Affine2D::from_trs_pivot(
            Vec2::new(100.0, 100.0),
            PI / 2.0,
            Vec2::ONE,
            Vec2::new(10.0, 10.0),
        );
        // The pivot itself should end up exactly at translation (100, 100)
        let transformed_pivot = trs.transform_point(Vec2::new(10.0, 10.0));
        assert!((transformed_pivot.x - 100.0).abs() < 1e-5);
        assert!((transformed_pivot.y - 100.0).abs() < 1e-5);
    }

    #[test]
    fn multiplication_and_inverse() {
        let t1 = Affine2D::translation(20.0, 30.0);
        let r1 = Affine2D::rotation(0.45);
        let s1 = Affine2D::scale(2.0, 0.5);
        let combined = t1.mul(&r1).mul(&s1);

        let inv = combined.inverse().expect("Inversion should succeed");
        let p = Vec2::new(42.0, -17.5);
        let back = inv.transform_point(combined.transform_point(p));

        assert!((back.x - p.x).abs() < 1e-4);
        assert!((back.y - p.y).abs() < 1e-4);
    }
}
