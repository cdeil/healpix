// js implementation of healpix
// http://iopscience.iop.org/article/10.1086/427976/pdf
//
// notations
// ---------
// theta :  colatitude (pi/2 - delta)                [0 , pi]
// phi   :  longitutde (alpha)                       [0, 2 pi)
// t     :  coord. of x-axis in sphirical projection [0, 2 pi)
// u     :  coord. of y-axis in sphirical projection [-1/2, 1/2]
// z     :  cos(theta)                               [-1, 1]
// a     :  phi                                      [0, 2 pi)
// f     :  base pixel index                         {0 .. 11}
// p     :  north-east axis in base pixel            [0, 1)
// q     :  north-west axis in base pixel            [0, 1)
// i     :  ring index                               {1 .. 4 nside - 1}
// j     :  pixel-in-ring index                      polar cap: {1 .. 4 i} ; equatorial belt: {1 .. 4 nside}


export type V3 = [number, number, number]


export function order2nside(order: number) {
    return 1 << order
}


export function nside2npix(nside: number) {
    return 12 * nside * nside
}


export function vec2pix_nest(nside: number, v: V3) {
    const { z, a } = vec2za(v[0], v[1], v[2])
    return za2pix_nest(nside, z, a)
}


export function vec2pix_ring(nside: number, v: V3) {
    const { z, a } = vec2za(v[0], v[1], v[2])
    return nest2ring(nside, za2pix_nest(nside, z, a))
}


export function ang2pix_nest(nside: number, theta: number, phi: number) {
    const z = Math.cos(theta)
    return za2pix_nest(nside, z, phi)
}


export function ang2pix_ring(nside: number, theta: number, phi: number) {
    const z = Math.cos(theta)
    return nest2ring(nside, za2pix_nest(nside, z, phi))
}


export function nest2ring(nside: number, ipix: number) {
    const { f, x, y } = nest2fxy(nside, ipix)
    return fxy2ring(nside, f, x, y)
}


// TODO: cleanup
export function ring2nest(nside: number, ipix: number) {
    if (nside == 1)
        return ipix
    const polar_lim = 2 * nside * (nside - 1)
    if (ipix < polar_lim) { // north polar cap
        const i = Math.floor((Math.sqrt(1 + 2 * ipix) + 1) / 2)
        const j = ipix - 2 * i * (i - 1)
        const f = Math.floor(j / i)
        const k = j % i
        const x = nside - i + k
        const y = nside - 1 - k
        return fxy2nest(nside, f, x, y)
    }
    if (ipix < polar_lim + 8 * nside * nside) { // equatorial belt
        const k = ipix - polar_lim
        const ring = 4 * nside
        const i = nside - Math.floor(k / ring)
        const s = i % 2 == 0 ? 1 : 0
        const j = 2 * (k % ring) + s
        const jj = j - 4 * nside
        const ii = i + 5 * nside - 1
        const pp = (ii + jj) / 2
        const qq = (ii - jj) / 2
        const PP = Math.floor(pp / nside)
        const QQ = Math.floor(qq / nside)
        const V = 5 - (PP + QQ)
        const H = PP - QQ + 4
        const f = 4 * V + (H >> 1) % 4
        const x = pp % nside
        const y = qq % nside
        return fxy2nest(nside, f, x, y)
    }
    else { // south polar cap
        const p = 12 * nside * nside - ipix - 1
        const i = Math.floor((Math.sqrt(1 + 2 * p) + 1) / 2)
        const j = p - 2 * i * (i - 1)
        const f = 11 - Math.floor(j / i)
        const k = j % i
        const x = i - k - 1
        const y = k
        return fxy2nest(nside, f, x, y)
    }
}


export function pix2vec_nest(nside: number, ipix: number) {
    const { f, x, y } = nest2fxy(nside, ipix)
    const { t, u } = fxy2tu(nside, f, x, y)
    const { z, a } = tu2za(t, u)
    return za2vec(z, a)
}


export function pix2vec_ring(nside: number, ipix: number) {
    return pix2vec_nest(nside, ring2nest(nside, ipix))
}


// TODO: cleanup
export function query_disc_inclusive_nest(nside: number, v: V3, radius: number, cb: (ipix: number) => void) {
    if (radius > PI_2) {
        throw new Error(`query_disc: radius must < PI/2`)
    }
    const pixrad = max_pixrad(nside)
    const d = PI_4 / nside
    const { z: z0, a: a0 } = vec2za(v[0], v[1], v[2]) // z0 = cos(theta)
    const sin_t = Math.sqrt(1 - z0 * z0)
    const cos_r = Math.cos(radius) // r := radius
    const sin_r = Math.sin(radius)
    const z1 = z0 * cos_r + sin_t * sin_r // cos(theta - r)
    const z2 = z0 * cos_r - sin_t * sin_r // cos(theta + r)
    const u1 = za2tu(z1, 0).u
    const u2 = za2tu(z2, 0).u
    const cover_north_pole = sin_t * cos_r - z0 * sin_r < 0 // sin(theta - r) < 0
    const cover_south_pole = sin_t * cos_r + z0 * sin_r < 0 // sin(theta - r) < 0
    let i1 = Math.floor((PI_2 - u1) / d)
    let i2 = Math.floor((PI_2 - u2) / d + 1)
    if (cover_north_pole) {
        ++i1
        for (let i = 1; i <= i1; ++i)
            walk_ring(nside, i, cb)
        ++i1
    }
    if (i1 == 0) {
        walk_ring(nside, 1, cb)
        i1 = 2
    }
    if (cover_south_pole) {
        --i2
        for (let i = i2; i <= 4 * nside - 1; ++i)
            walk_ring(nside, i, cb)
        --i2
    }
    if (i2 == 4 * nside) {
        walk_ring(nside, 4 * nside - 1, cb)
        i2 = 4 * nside - 2
    }
    const theta = Math.acos(z0)
    for (let i = i1; i <= i2; ++i)
        walk_ring_around(nside, i, a0, theta, radius + pixrad, ipix => {
            if (angle(pix2vec_nest(nside, ipix), v) <= radius + pixrad)
                cb(ipix)
        })
}


export function query_disc_inclusive_ring(nside: number, v: V3, radius: number, cb_ring: (ipix: number) => void) {
    return query_disc_inclusive_nest(nside, v, radius, ipix => {
        cb_ring(nest2ring(nside, ipix))
    })
}

export function max_pixrad(nside: number) {
    const unit = PI_4 / nside
    return angle(
        tu2vec(unit, nside * unit),
        tu2vec(unit, (nside + 1) * unit),
    )
}


function angle(a: V3, b: V3) {
    return 2 * Math.asin(Math.sqrt(distance2(a, b)) / 2)
}


function tu2vec(t: number, u: number): V3 {
    const { z, a } = tu2za(t, u)
    return za2vec(z, a)
}


function distance2(a: V3, b: V3) {
    const dx = a[0] - b[0]
    const dy = a[1] - b[1]
    const dz = a[2] - b[2]
    return dx * dx + dy * dy + dz * dz
}


type FXY = { f: number, x: number, y: number }


function walk_ring_around(nside: number, i: number, a0: number, theta: number, r: number, cb: (ipix: number) => void) {
    if (theta < r || theta + r > PI)
        return walk_ring(nside, i, cb)
    const u = PI_4 * (2 - i / nside)
    const z = tu2za(PI_4, u).z
    const st = Math.sin(theta)
    const ct = Math.cos(theta)
    const sr = Math.sin(r)
    const cr = Math.cos(r)
    const w = Math.atan2(
        Math.sqrt(-square(z - ct * cr) / (square(st) * sr * sr) + 1) * sr,
        (-z * ct + cr) / st
    )
    if (w >= PI)
        return walk_ring(nside, i, cb)
    const t1 = center_t(nside, i, za2tu(z, wrap(a0 - w, PI2)).t)
    const t2 = center_t(nside, i, za2tu(z, wrap(a0 + w, PI2)).t)
    const begin = tu2fxy(nside, t1, u)
    const end = right_next_pixel(nside, tu2fxy(nside, t2, u))
    for (let s = begin; !fxy_compare(s, end); s = right_next_pixel(nside, s)) {
        cb(fxy2nest(nside, s.f, s.x, s.y))
    }
}


function center_t(nside: number, i: number, t: number) {
    const d = PI_4 / nside
    t /= d
    t = (((t + i % 2) >> 1) << 1) + 1 - i % 2
    t *= d
    return t
}


function walk_ring(nside: number, i: number, cb: (ipix: number) => void) {
    const u = PI_4 * (2 - i / nside)
    const t = PI_4 * (1 + (1 - i % 2) / nside)
    const begin = tu2fxy(nside, t, u)
    let s = begin
    do {
        cb(fxy2nest(nside, s.f, s.x, s.y))
        s = right_next_pixel(nside, s)
    } while (!fxy_compare(s, begin))
}


function fxy_compare(a: FXY, b: FXY) {
    return a.x == b.x && a.y == b.y && a.f == b.f
}


function right_next_pixel(nside: number, { f, x, y }: FXY) {
    ++x
    if (x == nside) {
        switch (Math.floor(f / 4)) {
            case 0:
                f = (f + 1) % 4
                x = y
                y = nside
                break
            case 1:
                f = f - 4
                x = 0
                break
            case 2:
                f = 4 + (f + 1) % 4
                x = 0
                break
        }
    }
    --y
    if (y == -1) {
        switch (Math.floor(f / 4)) {
            case 0:
                f = 4 + (f + 1) % 4
                y = nside - 1
                break
            case 1:
                f = f + 4
                y = nside - 1
                break
            case 2: {
                f = 8 + (f + 1) % 4
                y = x - 1
                x = 0
                break
            }
        }
    }
    return { f, x, y }
}


export function corners_nest(nside: number, ipix: number) {
    const { f, x, y } = nest2fxy(nside, ipix)
    const { t, u } = fxy2tu(nside, f, x, y)
    const d = PI_4 / nside
    const xyzs: V3[] = []
    for (const [tt, uu] of [
        [0, d],
        [-d, 0],
        [0, -d],
        [d, 0],
    ]) {
        const { z, a } = tu2za(t + tt, u + uu)
        xyzs.push(za2vec(z, a))
    }
    return xyzs
}


export function corners_ring(nside: number, ipix: number) {
    return corners_nest(nside, ring2nest(nside, ipix))
}


// pixel area
export function nside2pixarea(nside: number) {
    return PI / (3 * nside * nside)
}


// average pixel size
export function nside2resol(nside: number) {
    return Math.sqrt(PI / 3) / nside
}


export function pixcoord2vec_nest(nside: number, ipix: number, ne: number, nw: number) {
    const { f, x, y } = nest2fxy(nside, ipix)
    const { t, u } = fxy2tu(nside, f, x, y)
    const d = PI_4 / nside
    const { z, a } = tu2za(t + d * (ne - nw), u + d * (ne + nw - 1))
    return za2vec(z, a)
}


export function pixcoord2vec_ring(nside: number, ipix: number, ne: number, nw: number) {
    return pixcoord2vec_nest(nside, ring2nest(nside, ipix), ne, nw)
}


function za2pix_nest(nside: number, z: number, a: number) {
    const { t, u } = za2tu(z, a)
    const { f, x, y } = tu2fxy(nside, t, u)
    return fxy2nest(nside, f, x, y)
}


function tu2fxy(nside: number, t: number, u: number) {
    const { f, p, q } = tu2fpq(t, u)
    const x = clamp(Math.floor(nside * p), 0, nside - 1)
    const y = clamp(Math.floor(nside * q), 0, nside - 1)
    return { x, f, y }
}


function wrap(x: number, p: number) {
    return x < 0 ? p - (-x % p) : x % p
}


const PI2 = 2 * Math.PI
const PI = Math.PI
const PI_2 = Math.PI / 2
const PI_4 = Math.PI / 4
const PI_8 = Math.PI / 8


function sigma(z: number): number {
    if (z < 0)
        return -sigma(-z)
    else
        return 2 - Math.sqrt(3 * (1 - z))
}


// (z, phi) -> sphirical projection
function za2tu(z: number, a: number) {
    if (Math.abs(z) <= 2. / 3.) { // equatorial belt
        const t = a
        const u = 3 * PI_8 * z
        return { t, u }
    }
    else { // polar caps
        const p_t = a % (PI_2)
        const sigma_z = sigma(z)
        const t = a - (Math.abs(sigma_z) - 1) * (p_t - PI_4)
        const u = PI_4 * sigma_z
        return { t, u }
    }
}


// sphirical projection -> (z, phi)
function tu2za(t: number, u: number) {
    const abs_u = Math.abs(u)
    if (abs_u >= PI_2) { // error
        return { z: sign(u), a: 0 }
    }
    if (abs_u <= Math.PI / 4) { // equatorial belt
        const z = 8 / (3 * PI) * u
        const a = t
        return { z, a }
    }
    else { // polar caps
        const t_t = t % (Math.PI / 2)
        const a = t - (abs_u - PI_4) / (abs_u - PI_2) * (t_t - PI_4)
        const z = sign(u) * (1 - 1 / 3 * square(2 - 4 * abs_u / PI))
        return { z, a }
    }
}


// (x, y, z) -> (z = cos(theta), phi)
function vec2za(x: number, y: number, z: number) {
    const r2 = x * x + y * y
    if (r2 == 0)
        return { z: z < 0 ? -1 : 1, a: 0 }
    else {
        const a = (Math.atan2(y, x) + PI2) % PI2
        z /= Math.sqrt(z * z + r2)
        return { z, a }
    }
}


// (z = cos(theta), phi) -> (x, y, z)
function za2vec(z: number, a: number): V3 {
    const sin_theta = Math.sqrt(1 - z * z)
    const x = sin_theta * Math.cos(a)
    const y = sin_theta * Math.sin(a)
    return [x, y, z]
}


export function ang2vec(theta: number, phi: number) {
    const z = Math.cos(theta)
    return za2vec(z, phi)
}


export function vec2ang(v: V3) {
    const { z, a } = vec2za(v[0], v[1], v[2])
    return { theta: Math.acos(z), phi: a }
}


// sphirical projection -> f, p, q
// f: base pixel index
// p: coord in north east axis of base pixel
// q: coord in north west axis of base pixel
function tu2fpq(t: number, u: number) {
    t /= PI_4
    u /= PI_4
    t = wrap(t, 8)
    t += -4
    u += 5
    const pp = clamp((u + t) / 2, 0, 5)
    const PP = Math.floor(pp)
    const qq = clamp((u - t) / 2, 3 - PP, 6 - PP)
    const QQ = Math.floor(qq)
    const V = 5 - (PP + QQ)
    if (V < 0) { // clamp
        return { f: 0, p: 1, q: 1 }
    }
    const H = PP - QQ + 4
    const f = 4 * V + (H >> 1) % 4
    const p = pp % 1
    const q = qq % 1
    return { f, p, q }
}


// f, p, q -> nest index
function fxy2nest(nside: number, f: number, x: number, y: number) {
    return f * nside * nside + bit_combine(x, y)
}


// x = (...x2 x1 x0)_2 <- in binary
// y = (...y2 y1 y0)_2
// p = (...y2 x2 y1 x1 y0 x0)_2
// returns p
export function bit_combine(x: number, y: number) {
    assert(x < (1 << 16))
    assert(y < (1 << 15))
    return (
        // (python)
        // n = 14
        // ' | '.join(['x & 1'] + [f'(x & 0x{2 ** (i+1):x} | y & 0x{2 ** i:x}) << {i + 1}' for i in range(n)] + [f'y & 0x{2**n:x} << {n+1}'])
        x & 1 | (x & 0x2 | y & 0x1) << 1 | (x & 0x4 | y & 0x2) << 2 |
        (x & 0x8 | y & 0x4) << 3 | (x & 0x10 | y & 0x8) << 4 | (x & 0x20 | y & 0x10) << 5 |
        (x & 0x40 | y & 0x20) << 6 | (x & 0x80 | y & 0x40) << 7 | (x & 0x100 | y & 0x80) << 8 |
        (x & 0x200 | y & 0x100) << 9 | (x & 0x400 | y & 0x200) << 10 | (x & 0x800 | y & 0x400) << 11 |
        (x & 0x1000 | y & 0x800) << 12 | (x & 0x2000 | y & 0x1000) << 13 | (x & 0x4000 | y & 0x2000) << 14 |
        (x & 0x8000 | y & 0x4000) << 15 | y & 0x8000 << 16
    )
}


// x = (...x2 x1 x0)_2 <- in binary
// y = (...y2 y1 y0)_2
// p = (...y2 x2 y1 x1 y0 x0)_2
// returns x, y
export function bit_decombine(p: number) {
    assert(p <= 0x7fffffff)
    // (python)
    // ' | '.join(f'(p & 0x{2**(2*i):x}) >> {i}' for i in range(16))
    const x = (p & 0x1) >> 0 | (p & 0x4) >> 1 | (p & 0x10) >> 2 |
        (p & 0x40) >> 3 | (p & 0x100) >> 4 | (p & 0x400) >> 5 |
        (p & 0x1000) >> 6 | (p & 0x4000) >> 7 | (p & 0x10000) >> 8 |
        (p & 0x40000) >> 9 | (p & 0x100000) >> 10 | (p & 0x400000) >> 11 |
        (p & 0x1000000) >> 12 | (p & 0x4000000) >> 13 | (p & 0x10000000) >> 14 | (p & 0x40000000) >> 15
    // (python)
    // ' | '.join(f'(p & 0x{2**(2*i + 1):x}) >> {i+1}' for i in range(15))
    const y = (p & 0x2) >> 1 | (p & 0x8) >> 2 | (p & 0x20) >> 3 |
        (p & 0x80) >> 4 | (p & 0x200) >> 5 | (p & 0x800) >> 6 |
        (p & 0x2000) >> 7 | (p & 0x8000) >> 8 | (p & 0x20000) >> 9 |
        (p & 0x80000) >> 10 | (p & 0x200000) >> 11 | (p & 0x800000) >> 12 |
        (p & 0x2000000) >> 13 | (p & 0x8000000) >> 14 | (p & 0x20000000) >> 15
    return { x, y }
}


// f: base pixel index
// x: north east index in base pixel
// y: north west index in base pixel
function nest2fxy(nside: number, ipix: number) {
    const nside2 = nside * nside
    const f = Math.floor(ipix / nside2) // base pixel index
    const k = ipix % nside2             // nested pixel index in base pixel
    const { x, y } = bit_decombine(k)
    return { f, x, y }
}


function fxy2ring(nside: number, f: number, x: number, y: number) {
    const f_row = Math.floor(f / 4) // {0 .. 2}
    const f1 = f_row + 2            // {2 .. 4}
    const v = x + y
    const i = f1 * nside - v - 1

    if (i < nside) { // north polar cap
        const f_col = f % 4
        const ipix = 2 * i * (i - 1) + (i * f_col) + nside - y - 1
        return ipix
    }
    if (i < 3 * nside) { // equatorial belt
        const h = x - y
        const f2 = 2 * (f % 4) - (f_row % 2) + 1  // {0 .. 7}
        const k = (f2 * nside + h + (8 * nside)) % (8 * nside)
        const offset = 2 * nside * (nside - 1)
        const ipix = offset + (i - nside) * 4 * nside + (k >> 1)
        return ipix
    }
    else { // south polar cap
        const i_i = 4 * nside - i
        const i_f_col = 3 - (f % 4)
        const j = 4 * i_i - (i_i * i_f_col) - y
        const i_j = 4 * i_i - j + 1
        const ipix = 12 * nside * nside - 2 * i_i * (i_i - 1) - i_j
        return ipix
    }
}


// f, x, y -> sphirical projection
function fxy2tu(nside: number, f: number, x: number, y: number) {
    const f_row = Math.floor(f / 4)
    const f1 = f_row + 2
    const f2 = 2 * (f % 4) - (f_row % 2) + 1
    const v = x + y
    const h = x - y
    const i = f1 * nside - v - 1
    const k = (f2 * nside + h + (8 * nside))
    const t = k / nside * PI_4
    const u = PI_2 - i / nside * PI_4
    return { t, u }
}


export type HealpixId = number


export function encode_id(order: number, index: number): HealpixId {
    return 4 * ((1 << (2 * order)) - 1) + index
}


export function decode_id(id: HealpixId) {
    assert(id <= 0x7fffffff)
    let order = 0
    let l = (id >> 2) + 1
    while (l >= 4) {
        l >>= 2
        ++order
    }
    const index = id - (((1 << (2 * order)) - 1) << 2)
    return { order, index }
}


const sign: (x: number) => number = (<any>Math).sign || function (x: number) {
    return x > 0 ? 1 : (x < 0 ? -1 : 0)
}


function square(x: number) {
    return x * x
}


function clamp(x: number, a: number, b: number) {
    return x < a ? a : (x > b ? b : x)
}


function assert(condition: boolean) {
    console.assert(condition)
    if (!condition) {
        debugger
    }
}