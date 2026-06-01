// ============================================================
// PYAAR — Piece geometry library.
// Defines the 8 character meshes and their per-side materials.
// Shared by main.js (the game) and characters.html (the gallery).
// Globals: bodyMat, accentMat, gemMat, buildPieceMesh.
// Requires: THREE.js loaded first.
// ============================================================

// PYAAR piece materials. Tuned for a refined, slightly polished feel —
// rich saffron / peacock bodies, burnished metal accents, jewel-tone gems.
function bodyMat(side) {
  return new THREE.MeshStandardMaterial({
    color: side === 'P1' ? 0xe88c2c : 0x2a4a78,
    roughness: side === 'P1' ? 0.34 : 0.30,
    metalness: 0.22,
  });
}
function accentMat(side) {
  return new THREE.MeshStandardMaterial({
    color: side === 'P1' ? 0x6e2a08 : 0x0e1c36,
    roughness: 0.30, metalness: 0.65,
  });
}
function gemMat(hex, emHex) {
  return new THREE.MeshStandardMaterial({
    color: hex, emissive: emHex || hex, emissiveIntensity: 0.55,
    roughness: 0.18, metalness: 0.45,
  });
}

function buildPieceMesh(type, side) {
  const group = new THREE.Group();
  // Two-tier base — wider plinth + slim collar — for a sturdier silhouette.
  const baseMat_ = new THREE.MeshStandardMaterial({
    color: side === 'P1' ? 0xb88a32 : 0x6a8aa8, roughness: 0.28, metalness: 0.70,
  });
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.05, 36), baseMat_);
  plinth.position.y = 0.025;
  plinth.castShadow = true; plinth.receiveShadow = true;
  group.add(plinth);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.05, 36), baseMat_);
  collar.position.y = 0.075;
  collar.castShadow = true; collar.receiveShadow = true;
  group.add(collar);

  const ringMat = new THREE.MeshStandardMaterial({
    color: side === 'P1' ? 0xe8b860 : 0xa0b8d0,
    emissive: side === 'P1' ? 0x4a2c08 : 0x132030,
    emissiveIntensity: 0.35,
    roughness: 0.18, metalness: 0.92,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.020, 12, 36), ringMat);
  ring.position.y = 0.105;
  ring.rotation.x = Math.PI / 2;
  ring.castShadow = true;
  group.add(ring);

  const mat = bodyMat(side);
  const acc = accentMat(side);

  if (type === 'LOVER') {
    // RADHA — the Beloved. Tall slim silhouette, lotus crown, ankle ring.
    // She is the crown-piece, so she gets the most refined detailing.
    const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.52, 28), mat);
    skirt.position.y = 0.13 + 0.26; skirt.castShadow = true; group.add(skirt);
    // Sash — gold band at the waist
    const sash = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.022, 12, 28), gemMat(0xffd070, 0xb47010));
    sash.position.y = 0.13 + 0.36; sash.rotation.x = Math.PI / 2; sash.castShadow = true; group.add(sash);
    // Slim torso
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.16, 20), mat);
    torso.position.y = 0.13 + 0.55; torso.castShadow = true; group.add(torso);
    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 18), mat);
    head.position.y = 0.13 + 0.70; head.castShadow = true; group.add(head);
    // Lotus crown — central jewel + 5 petals around it
    const crownJewel = new THREE.Mesh(new THREE.OctahedronGeometry(0.055, 1), gemMat(0xffd070, 0xc8345c));
    crownJewel.position.y = 0.13 + 0.88; crownJewel.castShadow = true; group.add(crownJewel);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const petal = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.11, 10), gemMat(0xff6680, 0xa62244));
      petal.position.set(Math.cos(a) * 0.085, 0.13 + 0.88, Math.sin(a) * 0.085);
      petal.rotation.x = Math.PI;
      petal.rotation.z = -a * 0.3;
      petal.castShadow = true; group.add(petal);
    }
    // Bindi (forehead dot)
    const bindi = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 8), gemMat(0xff3030, 0xff5544));
    bindi.position.set(0, 0.13 + 0.73, 0.12); group.add(bindi);
    // Necklace
    const necklace = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.012, 12, 24), gemMat(0xffd070, 0xb47010));
    necklace.position.y = 0.13 + 0.62; necklace.rotation.x = Math.PI / 2; necklace.castShadow = true; group.add(necklace);
    // Anklet — gold ring at the base
    const anklet = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.014, 10, 28), gemMat(0xffd070, 0xb47010));
    anklet.position.y = 0.13 + 0.02; anklet.rotation.x = Math.PI / 2; group.add(anklet);

  } else if (type === 'WARRIOR') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.42, 18), mat);
    body.position.y = 0.13 + 0.21; body.castShadow = true; group.add(body);
    const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.3), mat);
    shoulders.position.y = 0.13 + 0.46; shoulders.castShadow = true; group.add(shoulders);
    const turban = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), mat);
    turban.position.y = 0.13 + 0.56; turban.scale.y = 0.9; turban.castShadow = true; group.add(turban);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.022, 8, 20), gemMat(0xffd070, 0xb47010));
    band.position.y = 0.13 + 0.50; band.rotation.x = Math.PI / 2; group.add(band);
    const plume = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.17, 8), gemMat(0xc8345c, 0x6b1228));
    plume.position.y = 0.13 + 0.76; plume.castShadow = true; group.add(plume);
    const sword = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.7, 0.045), acc);
    sword.position.set(0.18, 0.13 + 0.4, 0); sword.castShadow = true; group.add(sword);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.13, 8), acc);
    tip.position.set(0.18, 0.13 + 0.8, 0); tip.castShadow = true; group.add(tip);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.06), acc);
    guard.position.set(0.18, 0.13 + 0.13, 0); guard.castShadow = true; group.add(guard);

  } else if (type === 'SAGE') {
    const robe = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 18), mat);
    robe.position.y = 0.13 + 0.35; robe.castShadow = true; group.add(robe);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), mat);
    head.position.y = 0.13 + 0.72; head.castShadow = true; group.add(head);
    const topknot = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), mat);
    topknot.position.y = 0.13 + 0.85; topknot.castShadow = true; group.add(topknot);
    const beard = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.20, 12), gemMat(0xf4ede0, 0xd0c8b8));
    beard.position.set(0, 0.13 + 0.60, 0.10); beard.rotation.x = Math.PI;
    beard.castShadow = true; group.add(beard);
    const beads = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.014, 8, 20), gemMat(0xb47010, 0x4a2c08));
    beads.position.y = 0.13 + 0.56; beads.rotation.x = Math.PI / 2; group.add(beads);
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.92, 8), acc);
    staff.position.set(-0.24, 0.13 + 0.46, 0); staff.castShadow = true; group.add(staff);
    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), gemMat(0xfff3a0, 0xffd060));
    orb.position.set(-0.24, 0.13 + 0.94, 0); orb.castShadow = true; group.add(orb);

  } else if (type === 'FOOL') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.22, 0.4, 14), mat);
    body.position.y = 0.13 + 0.2; body.castShadow = true; group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), mat);
    head.position.y = 0.13 + 0.47; head.castShadow = true; group.add(head);
    for (let i = 0; i < 3; i++) {
      const angle = ((i - 1) / 2) * 0.7;
      const tilt = (i - 1) * 0.4;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 8), gemMat(0xc8345c, 0x6b1228));
      spike.position.set(Math.sin(angle) * 0.05, 0.13 + 0.66, Math.sin(tilt) * 0.05);
      spike.rotation.z = tilt * 0.8;
      spike.castShadow = true; group.add(spike);
      const bell = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), gemMat(0xffd060, 0xb46a18));
      bell.position.set(Math.sin(angle) * 0.13, 0.13 + 0.78, Math.sin(tilt) * 0.13);
      bell.castShadow = true; group.add(bell);
    }
    const anklets = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.018, 6, 18), gemMat(0xffd060, 0xb46a18));
    anklets.position.y = 0.13 + 0.02; anklets.rotation.x = Math.PI / 2; group.add(anklets);

  } else if (type === 'TRAITOR') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.5, 16), mat);
    body.position.y = 0.13 + 0.25; body.rotation.z = 0.1;
    body.castShadow = true; group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), mat);
    head.position.set(0.03, 0.13 + 0.55, 0); head.castShadow = true; group.add(head);
    const cowl = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 14, 8, 0, Math.PI*2, 0, Math.PI*0.45), mat);
    cowl.position.set(0.03, 0.13 + 0.6, 0); cowl.castShadow = true; group.add(cowl);
    const dagger = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22, 8), acc);
    dagger.position.set(-0.22, 0.13 + 0.36, 0.05);
    dagger.rotation.z = Math.PI * 0.4;
    dagger.castShadow = true; group.add(dagger);
    const daggerGuard = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.025, 0.04), acc);
    daggerGuard.position.set(-0.13, 0.13 + 0.28, 0.05);
    daggerGuard.rotation.z = Math.PI * 0.4;
    daggerGuard.castShadow = true; group.add(daggerGuard);
    const tilak = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.06, 0.006), gemMat(0xa62244, 0x4a0e1a));
    tilak.position.set(0.03, 0.13 + 0.58, 0.12); group.add(tilak);

  } else if (type === 'GUARDIAN') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.45, 18), mat);
    body.position.y = 0.13 + 0.22; body.castShadow = true; group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), mat);
    head.position.y = 0.13 + 0.55; head.castShadow = true; group.add(head);
    const helmRing = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 8, 20), gemMat(0xffd060, 0xb46a18));
    helmRing.position.y = 0.13 + 0.50; helmRing.rotation.x = Math.PI / 2;
    helmRing.castShadow = true; group.add(helmRing);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const pt = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.06, 6), gemMat(0xffd070, 0xb47010));
      pt.position.set(Math.cos(a) * 0.15, 0.13 + 0.54, Math.sin(a) * 0.15);
      group.add(pt);
    }
    const macePole = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.55, 8), acc);
    macePole.position.set(-0.28, 0.13 + 0.35, 0); macePole.castShadow = true; group.add(macePole);
    const maceHead = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), gemMat(0xb47010, 0x6a3000));
    maceHead.position.set(-0.28, 0.13 + 0.67, 0); maceHead.castShadow = true; group.add(maceHead);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const stud = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), gemMat(0xffd070, 0xb47010));
      stud.position.set(-0.28 + Math.cos(a) * 0.09, 0.13 + 0.67, Math.sin(a) * 0.09);
      group.add(stud);
    }

  } else if (type === 'DREAMER') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 0.5, 16), mat);
    body.position.y = 0.13 + 0.25; body.castShadow = true; group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 14), mat);
    head.position.y = 0.13 + 0.58; head.castShadow = true; group.add(head);
    const moon = new THREE.Mesh(
      new THREE.TorusGeometry(0.13, 0.03, 8, 20, Math.PI * 1.2),
      gemMat(0xddeaff, 0x6b88c4)
    );
    moon.position.set(0, 0.13 + 0.85, 0);
    moon.rotation.z = Math.PI * 0.7;
    moon.castShadow = true; group.add(moon);
    const thirdEye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), gemMat(0xffd070, 0xff8a30));
    thirdEye.position.set(0, 0.13 + 0.62, 0.12); group.add(thirdEye);
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.045), gemMat(0xffe9a0, 0xfff0d0));
    star.position.set(0.18, 0.13 + 0.75, 0); star.castShadow = true; group.add(star);

  } else if (type === 'SOLDIER') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.4, 16), mat);
    body.position.y = 0.13 + 0.2; body.castShadow = true; group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), mat);
    head.position.y = 0.13 + 0.48; head.castShadow = true; group.add(head);
    const turban = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 10), mat);
    turban.position.y = 0.13 + 0.55; turban.scale.y = 0.7;
    turban.castShadow = true; group.add(turban);
    const ornament = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), gemMat(0xffd070, 0xb47010));
    ornament.position.y = 0.13 + 0.66; group.add(ornament);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.05, 8), acc);
    pole.position.set(0.2, 0.13 + 0.55, 0); pole.castShadow = true; group.add(pole);
    const flagShape = new THREE.Shape();
    flagShape.moveTo(0, 0);
    flagShape.lineTo(0.05, 0);
    flagShape.lineTo(0.05, 0.22);
    flagShape.lineTo(0.30, 0.16);
    flagShape.lineTo(0.05, 0.10);
    flagShape.lineTo(0.05, 0);
    const flagMat = new THREE.MeshStandardMaterial({
      color: side === 'P1' ? 0xe2a445 : 0x1f6a8a,
      emissive: side === 'P1' ? 0x4a1e02 : 0x081f3a,
      emissiveIntensity: 0.4,
      roughness: 0.45, metalness: 0.3,
      side: THREE.DoubleSide,
    });
    const flagGeom = new THREE.ExtrudeGeometry(flagShape, { depth: 0.008, bevelEnabled: false });
    const flag = new THREE.Mesh(flagGeom, flagMat);
    flag.position.set(0.2, 0.13 + 0.84, 0);
    flag.castShadow = true; group.add(flag);
  }

  group.userData = { kind: 'piece' };
  return group;
}
