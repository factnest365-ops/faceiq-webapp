/**
 * Deterministic synthetic fixture: the validated design face from the G4
 * step-1 harness (docs/faceiq/g4/synthetic_step1.py design()).
 *
 * Every measurement the engine returns on this fixture is a known design
 * value. Used by the engine unit tests (AC-01) and the smoke script.
 *
 * Face space: y up, trichion-menton = 160 mm, bizygonomic width = 114.3 mm.
 */

import { type FacePoints, type Pt } from "./geometry";

const H = 160;

export function fixture(): FacePoints {
  // y up (face space, mirrors design() in docs/faceiq/g4/synthetic_step1.py)
  return {
    trichion: { x: 0, y: H },
    glabella: { x: 0, y: 109.2 },
    subnasale: { x: 0, y: 54 },
    menton: { x: 0, y: 0 },
    zygionL: { x: -57.1428571, y: 0 },
    zygionR: { x: 57.1428571, y: 0 },
    gonionL: { x: -49.7142857, y: -2 },
    gonionR: { x: 49.7142857, y: -2 },
    innerCanthusL: { x: -4, y: 115.2 },
    innerCanthusR: { x: 4, y: 115.2 },
    outerCanthusL: { x: -4 - Math.sqrt(160), y: 118.2 }, // |ic-oc| = sqrt(12.649² + 3²) = 13mm
    outerCanthusR: { x: 4 + Math.sqrt(160), y: 118.2 },
    eyeTopL: { x: -4, y: 119.2 },
    eyeBottomL: { x: -4, y: 111.2 },
    eyeTopR: { x: 4, y: 119.2 },
    eyeBottomR: { x: 4, y: 111.2 },
    irisCenterL: { x: -26, y: 115.2 },
    irisCenterR: { x: 26, y: 115.2 },
    nasion: { x: 0, y: 80 },
    alarBaseL: { x: -13, y: 82 },
    alarBaseR: { x: 13, y: 82 },
    philtrum: { x: 0, y: 96 },
    stomion: { x: 0, y: 57.6 },
    mouthCornerL: { x: -10, y: 57.6 },
    mouthCornerR: { x: 10, y: 57.6 },
    browTopL: { x: 0, y: 127.2 },
    browTopR: { x: 0, y: 127.2 },
    earL: { x: -10, y: 30 },
    earR: { x: 10, y: 30 },
  };
}

/** Design values of the fixture (engine output target), from the G4 harness. */
export const FIXTURE_DESIGN: Record<string, number> = {
  third_upper: 0.3175,
  third_middle: 0.345,
  third_lower: 0.3375,
  face_height_width: 1.4, // 160 / (2 * 57.1428571)
  eye_mouth_length: 0.36, // 57.6mm eye-to-mouth / 160mm face length
  interocular_face_width: 0.455, // IPD 52mm / bizygobic 114.2857mm (Pallett ~0.46)
  intercanthal_eye_width: 8 / 13, // ICD 8mm / fissure width 13mm
  eye_aspect: 8 / 13,
  canthal_tilt: 13.342363797088234, // atan2(3, sqrt(160)) deg both eyes
  lip_ratio: 0.5,
  bigonial_bizygonomic: 0.87,
  symmetry_index: 1,
  fwhr_upper: 3.6630036602564098, // W 114.2857 / dist(browTop, philtrum) 31.2
  midface_ratio: 2.708333333333333, // IPD 52 / dist(eyeMid, philtrum) 19.2
  nose_width_ratio: 3.25,
  nasal_index: 1.0, // alar 26 / dist(nasion, subnasale) 26
  mouth_nose_ratio: 0.7692307692307693, // 20 / 26 (alar base width)
  chin_philtrum: 16.0, // dist(stomion, menton) 57.6 / dist(subnasale, stomion) 3.6
  bitemporal_ratio: 0.175,
};

export type { Pt };
