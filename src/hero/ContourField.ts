import fragmentSource from './contour.frag.glsl?raw';

const vertexSource = `#version 300 es
in vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }`;

const MAX_DPR = 1.5;

type Rgb = [number, number, number];

function cssColor(name: string): Rgb {
  const hex = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader failed to compile');
  }
  return shader;
}

/**
 * Animated contour field on a full-bleed canvas.
 * `onFirstFrame` fires once the field is visible so the static fallback can be hidden.
 * Throws if WebGL2 is unavailable; callers keep the static fallback in that case.
 */
export class ContourField {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private frame = 0;
  private running = false;
  private visible = true;
  private start = performance.now();
  private last = 0;
  private pointer = { x: 0.7, y: 0.6, tx: 0.7, ty: 0.6 };
  private hill = { value: 0, target: 0 };
  private colors = { line: cssColor('--sage'), road: cssColor('--dusk') };
  private firstFrameDone = false;
  private disposers: (() => void)[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private host: HTMLElement,
    private onFirstFrame: () => void,
    private onLost: () => void,
  ) {
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: false });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;

    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? 'Program failed to link');
    }
    this.program = program;
    gl.useProgram(program);

    // One triangle that covers the viewport
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    for (const name of ['uResolution', 'uTime', 'uPointer', 'uHill', 'uDpr', 'uLineColor', 'uRoadColor']) {
      this.uniforms[name] = gl.getUniformLocation(program, name);
    }

    this.listen();
  }

  private listen() {
    const onMove = (event: PointerEvent) => {
      const rect = this.host.getBoundingClientRect();
      this.pointer.tx = (event.clientX - rect.left) / rect.width;
      this.pointer.ty = 1 - (event.clientY - rect.top) / rect.height;
      this.hill.target = 1;
    };
    const onLeave = () => {
      this.hill.target = 0;
    };
    // pointerdown places the hill on tap; touch drags are left to native scrolling
    this.host.addEventListener('pointerdown', onMove);
    this.host.addEventListener('pointermove', onMove);
    this.host.addEventListener('pointerleave', onLeave);
    this.disposers.push(() => {
      this.host.removeEventListener('pointerdown', onMove);
      this.host.removeEventListener('pointermove', onMove);
      this.host.removeEventListener('pointerleave', onLeave);
    });

    const resize = new ResizeObserver(() => this.resize());
    resize.observe(this.canvas);
    this.disposers.push(() => resize.disconnect());

    const intersection = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.sync();
    });
    intersection.observe(this.canvas);
    this.disposers.push(() => intersection.disconnect());

    const onVisibility = () => this.sync();
    document.addEventListener('visibilitychange', onVisibility);
    this.disposers.push(() => document.removeEventListener('visibilitychange', onVisibility));

    // Re-read token colours when the theme toggles
    const theme = new MutationObserver(() => {
      this.colors = { line: cssColor('--sage'), road: cssColor('--dusk') };
      if (!this.running) this.draw(this.last);
    });
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    this.disposers.push(() => theme.disconnect());

    const onLost = (event: Event) => {
      event.preventDefault();
      this.stop();
      this.onLost();
    };
    this.canvas.addEventListener('webglcontextlost', onLost);
    this.disposers.push(() => this.canvas.removeEventListener('webglcontextlost', onLost));
  }

  private resize() {
    const dpr = Math.min(devicePixelRatio || 1, MAX_DPR);
    const width = Math.round(this.canvas.clientWidth * dpr);
    const height = Math.round(this.canvas.clientHeight * dpr);
    if (width === this.canvas.width && height === this.canvas.height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
    if (!this.running) this.draw(this.last);
  }

  private draw(time: number) {
    const { gl, uniforms: u, colors } = this;
    gl.uniform2f(u.uResolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.uTime, time);
    gl.uniform2f(u.uPointer, this.pointer.x, this.pointer.y);
    gl.uniform1f(u.uHill, this.hill.value);
    gl.uniform1f(u.uDpr, Math.min(devicePixelRatio || 1, MAX_DPR));
    gl.uniform3fv(u.uLineColor, colors.line);
    gl.uniform3fv(u.uRoadColor, colors.road);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (!this.firstFrameDone) {
      this.firstFrameDone = true;
      this.onFirstFrame();
    }
  }

  private tick = (now: number) => {
    const time = (now - this.start) / 1000;
    const dt = Math.min(time - this.last, 0.1);
    this.last = time;

    // Frame-rate independent easing toward the pointer
    const ease = 1 - Math.exp(-dt * 5);
    this.pointer.x += (this.pointer.tx - this.pointer.x) * ease;
    this.pointer.y += (this.pointer.ty - this.pointer.y) * ease;
    this.hill.value += (this.hill.target - this.hill.value) * (1 - Math.exp(-dt * 2.5));

    this.draw(time);
    this.frame = requestAnimationFrame(this.tick);
  };

  /** Runs only while on screen and the tab is visible. */
  private sync() {
    const shouldRun = this.visible && document.visibilityState === 'visible';
    if (shouldRun && !this.running) {
      this.running = true;
      // Resume from where time stopped instead of jumping ahead
      this.start = performance.now() - this.last * 1000;
      this.frame = requestAnimationFrame(this.tick);
    } else if (!shouldRun) {
      this.stop();
    }
  }

  private stop() {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }

  begin() {
    this.resize();
    this.sync();
  }

  dispose() {
    this.stop();
    for (const dispose of this.disposers) dispose();
    this.gl.deleteProgram(this.program);
    // Free the context now; browsers cap live WebGL contexts and navigations add up.
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
