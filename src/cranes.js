import * as THREE from 'three';

// A couple of white cranes gliding over the cloud sea — deliberately simple.
function wingGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, 0.14);
  s.bezierCurveTo(0.35, 0.22, 0.7, 0.16, 1.02, 0.02);
  s.lineTo(1.08, -0.06);
  s.lineTo(0.92, -0.1);
  s.lineTo(0.95, -0.16);
  s.lineTo(0.78, -0.16);
  s.lineTo(0.8, -0.22);
  s.bezierCurveTo(0.5, -0.2, 0.2, -0.16, 0, -0.14);
  const g = new THREE.ShapeGeometry(s, 8);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  const col = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const k = THREE.MathUtils.smoothstep(x, 0.66, 0.8);
    col.push(0.95 - 0.83 * k, 0.95 - 0.83 * k, 0.93 - 0.81 * k);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

export function buildCranes({ rng }) {
  const group = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color: '#f2f2ee' });
  const black = new THREE.MeshLambertMaterial({ color: '#202020' });
  const red = new THREE.MeshBasicMaterial({ color: '#a8261f' });
  const wingMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const wingGeo = wingGeometry();
  const birds = [];
  const paths = [
    { c: new THREE.Vector3(-15, -0.6, 8), rx: 6, rz: 3.5, speed: 0.11, h: 0 },
    { c: new THREE.Vector3(-13, 0.4, 10.5), rx: 5, rz: 3, speed: 0.13, h: 1.2 },
  ];
  for (const p of paths) {
    const b = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), white);
    body.scale.set(0.75, 0.7, 1.7);
    b.add(body);
    const neck = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.02, 0.2), new THREE.Vector3(0, 0.07, 0.42), new THREE.Vector3(0, 0.08, 0.66)]), 8, 0.03, 5),
      white
    );
    b.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), white);
    head.position.set(0, 0.08, 0.69);
    b.add(head);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), red);
    crown.position.set(0, 0.12, 0.69);
    b.add(crown);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.17, 5), new THREE.MeshLambertMaterial({ color: '#8c8a70' }));
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.07, 0.8);
    b.add(beak);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 6), black);
    tail.rotation.x = -Math.PI / 2;
    tail.position.set(0, 0.01, -0.32);
    b.add(tail);
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.55, 4), black);
    legs.rotation.x = Math.PI / 2 - 0.1;
    legs.position.set(0, -0.04, -0.6);
    b.add(legs);
    const wl = new THREE.Group(), wr = new THREE.Group();
    const ml = new THREE.Mesh(wingGeo, wingMat);
    const mr = new THREE.Mesh(wingGeo, wingMat);
    mr.scale.x = -1;
    wl.add(ml);
    wr.add(mr);
    wl.position.set(0.08, 0.04, 0.02);
    wr.position.set(-0.08, 0.04, 0.02);
    b.add(wl, wr);
    b.scale.setScalar(1.1);
    group.add(b);
    birds.push({ b, wl, wr, p, ph: rng.next() * 6.28 });
  }
  const tmp = new THREE.Vector3();
  return {
    group,
    update(t) {
      for (const { b, wl, wr, p, ph } of birds) {
        const a = ph + t * p.speed;
        const pos = (aa) =>
          tmp.set(p.c.x + Math.cos(aa) * p.rx, p.c.y + Math.sin(t * 0.35 + ph) * 0.35, p.c.z + Math.sin(aa) * p.rz);
        b.position.copy(pos(a));
        const ahead = pos(a + 0.05).clone();
        b.lookAt(ahead);
        b.rotateZ(-0.35);
        const flap = Math.sin(t * 3.2 + ph);
        const glide = 0.5 + 0.5 * Math.sin(t * 0.4 + ph);
        wl.rotation.z = flap * 0.55 * glide + 0.08;
        wr.rotation.z = -flap * 0.55 * glide - 0.08;
      }
    },
  };
}
