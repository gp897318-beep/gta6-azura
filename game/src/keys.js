// Keyboard + mouse state for AZURA. Tracks held keys by code, edge presses
// (pressed once per keydown), and the last mouse click point in screen space.
export class Keys {
  constructor() {
    this.down = {};
    this.edge = {};
    this.mouseX = 0;
    this.mouseY = 0;
    this.clicked = false;
    this._onDown = (e) => {
      if (e.repeat) return;
      this.down[e.code] = true;
      this.edge[e.code] = true;
      if (e.code === 'Space') e.preventDefault();
    };
    this._onUp = (e) => { this.down[e.code] = false; };
    this._onMove = (e) => { this.mouseX = e.clientX; this.mouseY = e.clientY; };
    this._onClick = (e) => {
      this.mouseX = e.clientX; this.mouseY = e.clientY;
      this.clicked = true;
    };
    window.addEventListener('keydown', this._onDown);
    window.addEventListener('keyup', this._onUp);
    window.addEventListener('mousemove', this._onMove);
    window.addEventListener('mousedown', this._onClick);
  }
  held(code) { return !!this.down[code]; }
  // True once, on the frame the key went down.
  tapped(code) { return !!this.edge[code]; }
  consumeClick() { const c = this.clicked; this.clicked = false; return c; }
  // Call at the end of each frame so taps only fire once.
  endFrame() { this.edge = {}; this.clicked = false; }
}
