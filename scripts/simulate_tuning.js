const CANNON = require('cannon-es');

function createWorld() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, 0, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  return world;
}

function createBody() {
  const body = new CANNON.Body({
    mass: 50,
    shape: new CANNON.Sphere(1),
    position: new CANNON.Vec3(0, 0, 0),
    linearDamping: 0.1,
    angularDamping: 0.6,
    allowSleep: false
  });
  body.angularFactor.set(0, 1, 0);
  return body;
}

function getYawFromQuaternion(q) {
  // Convert quaternion to yaw (rotation around Y)
  // yaw = atan2(2*(w*y + z*x), 1 - 2*(y*y + z*z)) but for Y axis: use simpler forward vector
  const forward = new CANNON.Vec3(0, 0, -1);
  q.vmult(forward, forward);
  const yaw = Math.atan2(forward.x, -forward.z); // radians
  return yaw;
}

function simulateConfig(name, params, durationSec = 5, inputSchedule = null) {
  const TICK_RATE = 60;
  const timestep = 1 / TICK_RATE;
  const world = createWorld();
  const body = createBody();
  world.addBody(body);

  // Default input: full throttle, slight right steering
  if (!inputSchedule) {
    inputSchedule = (t) => ({ throttle: 1, steering: 0.3, boost: false });
  }

  for (let i = 0; i < Math.floor(durationSec * TICK_RATE); i++) {
    const t = i * timestep;
    const input = inputSchedule(t);

    // Wake up body
    body.wakeUp();

    // Speed
    const speed = body.velocity.length();

    // Steering
    const maxSteerRate = params.maxSteerRate || 8.0;
    const minSpeedForSteering = params.minSpeedForSteering || 2.0;
    let steerRate;
    if (speed < minSpeedForSteering) steerRate = maxSteerRate;
    else {
      const speedFactor = Math.max(0.3, minSpeedForSteering / speed);
      steerRate = maxSteerRate * speedFactor;
    }

    const targetAngVelY = -input.steering * steerRate;
    const currentAngVelY = body.angularVelocity.y || 0;
    const steerSmoothing = params.steerSmoothing || 0.22;
    const maxAngChange = params.maxAngChange || 0.6;
    let angDelta = (targetAngVelY - currentAngVelY) * steerSmoothing;
    if (angDelta > maxAngChange) angDelta = maxAngChange;
    if (angDelta < -maxAngChange) angDelta = -maxAngChange;
    body.angularVelocity.y = currentAngVelY + angDelta;

    // Forward vector
    const forward = new CANNON.Vec3(0, 0, -1);
    body.quaternion.vmult(forward, forward);
    forward.normalize();

    // Throttle force
    const driveForce = params.driveForce || 15000;
    const force = forward.clone();
    force.scale(input.throttle * driveForce, force);
    body.applyForce(force, body.position);

    // Lateral friction
    const up = new CANNON.Vec3(0, 1, 0);
    const right = new CANNON.Vec3();
    forward.cross(up, right);
    right.normalize();

    const lateralVelocity = body.velocity.dot(right);
    const grip = params.grip || 0.3;
    const correctionForce = right.clone();
    correctionForce.scale(-lateralVelocity * grip * body.mass * 3, correctionForce);
    body.applyForce(correctionForce, body.position);

    // Speed cap
    const maxSpeed = params.maxSpeed || 200;
    if (body.velocity.length() > maxSpeed) {
      body.velocity.scale(maxSpeed / body.velocity.length(), body.velocity);
    }

    world.step(timestep);

    // Log brief telemetry every 0.5s
    if (i % Math.floor(0.5 * TICK_RATE) === 0) {
      const yaw = getYawFromQuaternion(body.quaternion);
      console.log(`${name} t=${t.toFixed(2)}s pos=(${body.position.x.toFixed(2)},${body.position.z.toFixed(2)}) speed=${body.velocity.length().toFixed(2)} yaw=${(yaw*180/Math.PI).toFixed(1)}deg`);
    }
  }

  const finalYaw = getYawFromQuaternion(body.quaternion);
  return {
    name,
    finalPos: { x: body.position.x, z: body.position.z },
    finalSpeed: body.velocity.length(),
    finalYaw
  };
}

async function run() {
  console.log('Starting tuning simulations...');

  const baseline = {
    driveForce: 15000,
    steerSmoothing: 0.0,
    maxAngChange: 1000,
    grip: 0.3,
    maxSpeed: 200
  };

  const tuned = {
    driveForce: 6000,
    steerSmoothing: 0.28,
    maxAngChange: 0.45,
    grip: 0.6,
    maxSpeed: 140
  };

  const baselineRes = simulateConfig('baseline', baseline, 5);
  console.log('---');
  const tunedRes = simulateConfig('tuned', tuned, 5);

  console.log('\nRESULTS:');
  console.log('Baseline:', baselineRes);
  console.log('Tuned   :', tunedRes);
}

run().catch(err => { console.error(err); process.exit(1); });
