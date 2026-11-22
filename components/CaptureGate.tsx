/** Capture gate messages (spec 5.1 R-09, R-10). */
export interface Gate {
  key: string;
  message: string;
  pass: boolean;
}

export function computeGates(
  hasFace: boolean,
  numFaces: number,
  yaw: number,
  pitch: number,
  roll: number,
  faceWidthPx: number,
  blurScore: number,
  lumaMin: number,
  lumaMax: number,
  clippedHighlightsPct: number,
  mouthOpen: number,
  browDown: number,
  browUp: number,
  repeatabilityPct: number,
  occluded: boolean,
): Gate[] {
  const faceWidthGate = faceWidthPx >= 200; // spec R-09: >= 200 px
  const gates: Gate[] = [
    { key: "face_present", message: "Retake: no face detected", pass: hasFace },
    { key: "single_face", message: "Retake: one face only", pass: numFaces <= 1 },
    { key: "pose", message: "Retake: face the camera, head level", pass: Math.abs(yaw) <= 5 && Math.abs(pitch) <= 5 && Math.abs(roll) <= 5 },
    { key: "face_size", message: "Retake: move closer", pass: faceWidthGate },
    { key: "blur", message: "Retake: hold still", pass: blurScore >= 25 }, // Laplacian variance, [A] 5.1
    { key: "exposure", message: "Retake: even light", pass: clippedHighlightsPct <= 1 && lumaMin >= 40 && lumaMax <= 210 },
    { key: "expression", message: "Retake: neutral expression", pass: mouthOpen <= 0.15 && browDown <= 0.3 && browUp <= 0.3 },
    { key: "repeatability", message: "Retake: hold still and steady the phone", pass: repeatabilityPct <= 2 },
    { key: "occlusion", message: "Retake: hair off the face, glasses off", pass: !occluded },
  ];
  return gates;
}

export function gatesAllPass(gates: Gate[]): boolean {
  return gates.every((g) => g.pass);
}

export function firstGateFailing(gates: Gate[]): Gate | undefined {
  return gates.find((g) => !g.pass);
}
