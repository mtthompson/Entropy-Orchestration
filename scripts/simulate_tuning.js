const fs = require('fs');
const path = require('path');
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
  const trace = [];

  // Default input: full throttle, slight right steering
  if (!inputSchedule) {
    inputSchedule = (t) => ({ throttle: 1, steering: 0.3, boost: false });
  }

  let simSpeed = 0;
  for (let i = 0; i < Math.floor(durationSec * TICK_RATE); i++) {
    const t = i * timestep;
    const input = inputSchedule(t);

    // Wake up body
    body.wakeUp();

    // Speed
    const velocity = body.velocity;
    const speed = velocity.length();

    // Arcade steering (match server logic)
    const baseTurnRate = params.baseTurnRate || 20.0;
    const speedDampen = 1 / (1 + speed * 0.004);
    const lowSpeedBoost = Math.min(1, speed / 3);
    const steerRate = baseTurnRate * speedDampen * (0.4 + 0.6 * lowSpeedBoost);

    const currentForward = new CANNON.Vec3(0, 0, -1);
    body.quaternion.vmult(currentForward, currentForward);
    const currentYaw = Math.atan2(currentForward.x, -currentForward.z);
    const maxYawStep = params.maxYawStep || 0.6;
    let yawDelta = -input.steering * steerRate * timestep;
    if (yawDelta > maxYawStep) yawDelta = maxYawStep;
    if (yawDelta < -maxYawStep) yawDelta = -maxYawStep;
    const newYaw = currentYaw + yawDelta;
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), newYaw);
    body.angularVelocity.y *= 0.2;

    // Forward vector
    const forward = new CANNON.Vec3(0, 0, -1);
    body.quaternion.vmult(forward, forward);
    forward.normalize();

    // Arcade Drive: target-speed approach and direct velocity alignment
    const baseMaxSpeed = params.maxSpeed || 140;
    let targetSpeed = input.throttle * baseMaxSpeed;

    let accelRate = params.accelRate || 95;
    let brakeRate = params.brakeRate || 140;
    let coastRate = params.coastRate || 60;

    if (input.boost) {
      targetSpeed *= params.boostSpeedMult || 1.35;
      accelRate *= params.boostAccelMult || 1.25;
    }

    if (input.throttle > 0.01) {
      if (simSpeed < targetSpeed) {
        simSpeed = Math.min(targetSpeed, simSpeed + accelRate * timestep);
      } else {
        simSpeed = Math.max(targetSpeed, simSpeed - brakeRate * timestep);
      }
    } else {
      simSpeed = Math.max(0, simSpeed - coastRate * timestep);
    }

    const desiredVelX = forward.x * simSpeed;
    const desiredVelZ = forward.z * simSpeed;
    const blend = 0.35;
    body.velocity.x = body.velocity.x + (desiredVelX - body.velocity.x) * blend;
    body.velocity.z = body.velocity.z + (desiredVelZ - body.velocity.z) * blend;

    // Speed cap
    const maxSpeed = baseMaxSpeed;
    if (body.velocity.length() > maxSpeed) {
      body.velocity.scale(maxSpeed / body.velocity.length(), body.velocity);
    }

    world.step(timestep);

    // Log brief telemetry every 0.5s
    if (i % Math.floor(0.5 * TICK_RATE) === 0) {
      const yaw = getYawFromQuaternion(body.quaternion);
      console.log(`${name} t=${t.toFixed(2)}s pos=(${body.position.x.toFixed(2)},${body.position.z.toFixed(2)}) speed=${body.velocity.length().toFixed(2)} yaw=${(yaw*180/Math.PI).toFixed(1)}deg`);
    }

    trace.push({
      time: parseFloat(t.toFixed(4)),
      x: parseFloat(body.position.x.toFixed(4)),
      z: parseFloat(body.position.z.toFixed(4)),
      speed: parseFloat(body.velocity.length().toFixed(4)),
      yaw: parseFloat(getYawFromQuaternion(body.quaternion).toFixed(4))
    });
  }

  const finalYaw = getYawFromQuaternion(body.quaternion);
  const tracesDir = path.join(__dirname, 'traces');
  fs.mkdirSync(tracesDir, { recursive: true });
  const tracePath = path.join(tracesDir, `${name}.json`);
  fs.writeFileSync(tracePath, JSON.stringify(trace, null, 2));
  return {
    name,
    finalPos: { x: body.position.x, z: body.position.z },
    finalSpeed: body.velocity.length(),
    finalYaw,
    tracePath
  };
}

function constantThrottleInput(steeringBias = 0.3) {
  return (t) => ({ throttle: 1, steering: steeringBias, boost: false });
}

function sinusoidalSteeringInput(freq = 1.5, amp = 0.6) {
  return (t) => ({ throttle: 0.95, steering: Math.sin(t * freq) * amp, boost: false });
}

function aggressivePulseInput() {
  return (t) => {
    const phase = (t % 4);
    const throttle = phase < 3 ? 1 : 0.1;
    const steering = phase < 2 ? 0.6 : -0.6;
    const boost = phase < 0.3 || (phase > 2.5 && phase < 2.8);
    return { throttle, steering, boost };
  };
}

async function run() {
  console.log('Starting extended tuning simulations (10–15s runs)...');

  const tuned = {
    maxYawStep: 0.6,
    maxSpeed: 140,
    accelRate: 85,
    brakeRate: 120,
    coastRate: 45,
    lateralGrip: 7.5,
    boostSpeedMult: 1.35,
    boostAccelMult: 1.25,
    baseTurnRate: 20.0
  };

  const scenarios = [
    {
      name: 'tuned_straight',
      duration: 12,
      params: tuned,
      inputSchedule: constantThrottleInput(0.15),
      description: 'Long straight with very mild steering to test stability.'
    },
    {
      name: 'tuned_sinuous',
      duration: 15,
      params: tuned,
      inputSchedule: sinusoidalSteeringInput(1.2, 0.5),
      description: 'Constant throttle with gentle curves to exercise grip.'
    },
    {
      name: 'tuned_aggressive',
      duration: 14,
      params: tuned,
      inputSchedule: aggressivePulseInput(),
      description: 'Throttle pulses + alternating steering mimic aggressive racing.'
    }
  ];

  const results = [];
  for (const scenario of scenarios) {
    console.log('---');
    console.log(`[SCENARIO] ${scenario.name}: ${scenario.description}`);
    const res = simulateConfig(
      scenario.name,
      scenario.params,
      scenario.duration,
      scenario.inputSchedule
    );
    results.push(res);
    console.log(`Completed ${scenario.name}`);
  }

  console.log('\nFINAL SUMMARY:');
  results.forEach((r) => {
    console.log(`${r.name}: pos=(${r.finalPos.x.toFixed(1)}, ${r.finalPos.z.toFixed(1)}), speed=${r.finalSpeed.toFixed(1)}, yaw=${(r.finalYaw * 180 / Math.PI).toFixed(1)}deg`);
  });
}

run().catch(err => { console.error(err); process.exit(1); });
