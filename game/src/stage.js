// Screenshot staging for AZURA. ?shot=cover|drive|mission|menu arranges a
// frozen, deterministic scene, then the main loop paints it a few times and
// sets window.__shotReady. The cover is the money frame: a five-star chase
// down Palm Dr at golden hour, SKYHOOK-1 overhead, a roadblock ahead, a
// burning wreck and a fireball on the roadside, the sea on the right.
export function stageShot(game, shot) {
  const g = game;
  if (shot === 'menu') {
    g.mode = 'menu';
    g.showMenu();
    return;
  }
  g.hideMenu();
  g.mode = 'playing';
  g.story.index = 0;
  g.story.state = 'idle';
  if (shot === 'cover') {
    g.placeInRide('falcon', 240, -40, Math.PI);
    g.playerRide.speed = 24;
    g.cruiseShot = true;
    g.cops.heat = 88; g.cops.wanted = 5;
    g.cops.stageChase(240, -40, Math.PI);
    g.cops.stageRoadblock(240, -40, Math.PI);
    g.spawnWreck(248, -64);
    g.spawnBlast(252, -78);
    g.story.index = 8;
    g.story.start();
    g.story.timer = 41;
    g.panel.say('LM', 'LUNA MARLOWE', 'FIXER — AZURA',
      'Five stars, kid. SWAT is rolling. Forty-five seconds of hell — then you disappear.', 30);
    g.money = 24840;
    g.respect = 78;
    g.clockMin = 18 * 60 + 47;
  } else if (shot === 'drive') {
    g.placeInRide('tidal', 240, 100, Math.PI);
    g.playerRide.speed = 24;
    g.cruiseShot = true;
    g.cops.heat = 0; g.cops.wanted = 0;
    g.story.index = 0;
    g.story.start();
    g.story.timer = 96;
    g.money = 8450;
    g.respect = 38;
    g.clockMin = 18 * 60 + 12;
    g.panel.say('LM', 'LUNA MARLOWE', 'FIXER — AZURA',
      'Case stays shut, car stays fast. Harbor crew pays in cash, no questions. Move.', 30);
  } else if (shot === 'mission') {
    g.placeOnFoot(-40, 230, Math.PI / 2);
    g.cops.heat = 0; g.cops.wanted = 0;
    g.story.index = 2;
    g.story.start();
    g.story.timer = 142;
    g.money = 9200;
    g.respect = 45;
    g.clockMin = 18 * 60 + 30;
    g.panel.say('LM', 'LUNA MARLOWE', 'FIXER — AZURA',
      'On foot from here, kid. The harbor is long and the wind is loud — perfect for a quiet handoff.', 30);
  }
  g.snapCam();
  // Widen the lens and tilt up a touch for the cover so SKYHOOK-1 and its
  // spotlight enter the frame while the car stays large at the bottom.
  if (shot === 'cover') {
    g.camera.fov = 70;
    g.camera.updateProjectionMatrix();
    g.camera.lookAt(g.camLook.x, g.camLook.y + 4, g.camLook.z);
  }
  g.settle = 12;
}
