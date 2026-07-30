/*!
 * KhairoLoader — motor de pantalla de carga reutilizable
 * Khairo Digital · sin dependencias externas
 *
 * Uso básico:
 *   const loader = new KhairoLoader({ root: '#khairo-loader' });
 *   loader.startSimulated();
 *
 * Uso con progreso real (bytes descargados):
 *   loader.trackAssets(['/img/hero.jpg', '/fonts/brand.woff2']);
 *
 * Ver README.md para todas las opciones.
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------
  var Easing = {
    linear: function (t) { return t; },
    easeOutCubic: function (t) { return 1 - Math.pow(1 - t, 3); },
    easeOutExpo: function (t) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); },
    easeInOutSine: function (t) { return -(Math.cos(Math.PI * t) - 1) / 2; }
  };

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // ---------------------------------------------------------------------
  // Shaders — nebulosa animada (fbm de ruido tipo valor, escrito a mano)
  // ---------------------------------------------------------------------
  var VERT_SRC = [
    'attribute vec2 aPosition;',
    'void main(){',
    '  gl_Position = vec4(aPosition, 0.0, 1.0);',
    '}'
  ].join('\n');

  var FRAG_SRC = [
    'precision mediump float;',
    'uniform vec2 uResolution;',
    'uniform float uTime;',
    'uniform float uProgress;',
    'uniform vec3 uBlue;',
    'uniform vec3 uViolet;',
    'uniform vec3 uElectric;',
    '',
    'vec2 hash(vec2 p){',
    '  p = vec2(dot(p, vec2(127.1,311.7)), dot(p, vec2(269.5,183.3)));',
    '  return -1.0 + 2.0*fract(sin(p)*43758.5453123);',
    '}',
    'float noise(vec2 p){',
    '  vec2 i = floor(p);',
    '  vec2 f = fract(p);',
    '  vec2 u = f*f*(3.0-2.0*f);',
    '  return mix(',
    '    mix(dot(hash(i+vec2(0.0,0.0)), f-vec2(0.0,0.0)), dot(hash(i+vec2(1.0,0.0)), f-vec2(1.0,0.0)), u.x),',
    '    mix(dot(hash(i+vec2(0.0,1.0)), f-vec2(0.0,1.0)), dot(hash(i+vec2(1.0,1.0)), f-vec2(1.0,1.0)), u.x),',
    '    u.y',
    '  );',
    '}',
    'float fbm(vec2 p){',
    '  float v = 0.0;',
    '  float a = 0.5;',
    '  for(int i=0;i<5;i++){',
    '    v += a*noise(p);',
    '    p *= 2.02;',
    '    a *= 0.5;',
    '  }',
    '  return v;',
    '}',
    'void main(){',
    '  vec2 uv = gl_FragCoord.xy / uResolution.xy;',
    '  float aspect = uResolution.x/uResolution.y;',
    '  vec2 p = (uv - 0.5) * vec2(aspect, 1.0) * 3.0;',
    '',
    '  float slow = uTime*0.045;',
    '  float n1 = fbm(p + vec2(slow, slow*0.6));',
    '  float n2 = fbm(p*1.7 - vec2(slow*0.8, -slow*0.5) + n1*0.6);',
    '',
    '  vec3 col = vec3(0.02, 0.024, 0.045);',
    '  col = mix(col, uViolet*0.5, smoothstep(0.05, 0.55, n2));',
    '  col = mix(col, uBlue*0.55, smoothstep(0.25, 0.75, n1));',
    '',
    '  float glow = smoothstep(0.55, 0.98, n2) * (0.5 + uProgress*0.6);',
    '  col += uElectric * glow * 0.4;',
    '',
    '  float d = length(uv - 0.5);',
    '  float vig = smoothstep(0.95, 0.25, d*1.3);',
    '  col *= (0.15 + vig*0.9);',
    '',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  // ---------------------------------------------------------------------
  // Clase principal
  // ---------------------------------------------------------------------
  function KhairoLoader(opts) {
    opts = opts || {};

    this.root = typeof opts.root === 'string'
      ? document.querySelector(opts.root)
      : (opts.root || document.getElementById('khairo-loader'));

    if (!this.root) {
      throw new Error('KhairoLoader: no se encontró el contenedor del loader.');
    }

    var reducedMotion = false;
    try {
      reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) { /* matchMedia no disponible, se ignora */ }

    this.opts = {
      minDuration: opts.minDuration != null ? opts.minDuration : 2800,
      messages: opts.messages || [
        'Inicializando sistema',
        'Cargando recursos',
        'Optimizando interfaz',
        'Casi listo'
      ],
      colors: opts.colors || {
        blue: [0.239, 0.322, 1.0],
        violet: [0.545, 0.361, 0.965],
        electric: [0.369, 0.902, 1.0]
      },
      reducedMotion: opts.reducedMotion != null ? opts.reducedMotion : reducedMotion,
      onComplete: typeof opts.onComplete === 'function' ? opts.onComplete : null
    };

    this.progress = 0;
    this.displayProgress = 0;
    this.rafId = null;
    this.startTime = null;
    this._initTime = performance.now();
    this.gl = null;
    this.exited = false;
    this._completing = false;
    this._decodeTimer = null;
    this._boundResize = null;
    this._boundVisibility = null;

    this._cacheDOM();
    this._buildOdometer();
    this._buildGrain();

    if (!this.opts.reducedMotion) {
      this._initBackground();
      this._initTilt();
    } else if (this.bgCanvas) {
      this.bgCanvas.style.display = 'none';
    }

    this._initMarkIntro();
    this._setStatus(this.opts.messages[0], true);

    var self = this;
    this._loop = this._loop.bind(this);
    this.rafId = requestAnimationFrame(this._loop);

    this._boundVisibility = function () {
      if (document.hidden) {
        if (self.rafId) cancelAnimationFrame(self.rafId);
      } else if (!self.exited) {
        self.rafId = requestAnimationFrame(self._loop);
      }
    };
    document.addEventListener('visibilitychange', this._boundVisibility);
  }

  // -- DOM ----------------------------------------------------------------
  KhairoLoader.prototype._cacheDOM = function () {
    this.bgCanvas = this.root.querySelector('#khairo-bg');
    this.grainEl = this.root.querySelector('.grain-overlay');
    this.counterEl = this.root.querySelector('#khairoCounter');
    this.statusEl = this.root.querySelector('#khairoStatus');
    this.barFill = this.root.querySelector('#khairoBarFill');
    this.progressbarEl = this.root.querySelector('[role="progressbar"]');
    this.markWrap = this.root.querySelector('.mark-wrap');
  };

  KhairoLoader.prototype._buildOdometer = function () {
    if (!this.counterEl) return;
    this.counterEl.innerHTML = '';
    this.digitStrips = [];
    for (var i = 0; i < 3; i++) {
      var digit = document.createElement('div');
      digit.className = 'digit';
      var strip = document.createElement('div');
      strip.className = 'digit-strip';
      strip.style.setProperty('--d', 0);
      for (var n = 0; n < 10; n++) {
        var span = document.createElement('span');
        span.textContent = String(n);
        strip.appendChild(span);
      }
      digit.appendChild(strip);
      this.counterEl.appendChild(digit);
      this.digitStrips.push(strip);
    }
    var pct = document.createElement('span');
    pct.className = 'pct-symbol';
    pct.textContent = '%';
    this.counterEl.appendChild(pct);
  };

  KhairoLoader.prototype._buildGrain = function () {
    if (!this.grainEl) return;
    var c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    var cx = c.getContext('2d');
    var imgData = cx.createImageData(128, 128);
    for (var i = 0; i < imgData.data.length; i += 4) {
      var v = Math.random() * 255;
      imgData.data[i] = v;
      imgData.data[i + 1] = v;
      imgData.data[i + 2] = v;
      imgData.data[i + 3] = 22;
    }
    cx.putImageData(imgData, 0, 0);
    this.grainEl.style.backgroundImage = 'url(' + c.toDataURL() + ')';
  };

  // -- Fondo WebGL / fallback ----------------------------------------------
  KhairoLoader.prototype._initBackground = function () {
    if (!this.bgCanvas) return;
    try {
      var gl = this.bgCanvas.getContext('webgl', {
        antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'low-power'
      }) || this.bgCanvas.getContext('experimental-webgl');
      if (!gl) throw new Error('WebGL no disponible');
      this.gl = gl;
      this._setupShaderProgram();
      this._resizeGL();
      var self = this;
      this._boundResize = function () { self._resizeGL(); };
      window.addEventListener('resize', this._boundResize);
    } catch (err) {
      this._initFallbackParticles();
    }
  };

  KhairoLoader.prototype._compileShader = function (type, source) {
    var gl = this.gl;
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error('KhairoLoader: error al compilar shader — ' + log);
    }
    return shader;
  };

  KhairoLoader.prototype._setupShaderProgram = function () {
    var gl = this.gl;
    var vs = this._compileShader(gl.VERTEX_SHADER, VERT_SRC);
    var fs = this._compileShader(gl.FRAGMENT_SHADER, FRAG_SRC);
    var program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error('KhairoLoader: fallo al enlazar el programa — ' + gl.getProgramInfoLog(program));
    }
    gl.useProgram(program);

    var quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    var posLoc = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    this.uResolution = gl.getUniformLocation(program, 'uResolution');
    this.uTime = gl.getUniformLocation(program, 'uTime');
    this.uProgress = gl.getUniformLocation(program, 'uProgress');

    gl.uniform3fv(gl.getUniformLocation(program, 'uBlue'), this.opts.colors.blue);
    gl.uniform3fv(gl.getUniformLocation(program, 'uViolet'), this.opts.colors.violet);
    gl.uniform3fv(gl.getUniformLocation(program, 'uElectric'), this.opts.colors.electric);
  };

  KhairoLoader.prototype._resizeGL = function () {
    if (!this.gl) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    var w = Math.max(1, Math.floor(this.bgCanvas.clientWidth * dpr));
    var h = Math.max(1, Math.floor(this.bgCanvas.clientHeight * dpr));
    if (this.bgCanvas.width !== w || this.bgCanvas.height !== h) {
      this.bgCanvas.width = w;
      this.bgCanvas.height = h;
      this.gl.viewport(0, 0, w, h);
    }
  };

  KhairoLoader.prototype._initFallbackParticles = function () {
    var canvas = this.bgCanvas;
    var ctx = canvas.getContext('2d');
    var self = this;
    function resize() {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    }
    resize();
    this._boundResize = resize;
    window.addEventListener('resize', resize);
    var count = Math.min(80, Math.floor((canvas.width * canvas.height) / 14000));
    var pts = [];
    for (var i = 0; i < count; i++) {
      pts.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3
      });
    }
    this._fallbackDraw = function () {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (var a = 0; a < pts.length; a++) {
        var p = pts[a];
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        ctx.fillStyle = 'rgba(150,180,255,.6)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
      for (var m = 0; m < pts.length; m++) {
        for (var n = m + 1; n < pts.length; n++) {
          var dx = pts[m].x - pts[n].x, dy = pts[m].y - pts[n].y;
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d < 120) {
            ctx.strokeStyle = 'rgba(120,150,255,' + (0.12 * (1 - d / 120)) + ')';
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(pts[m].x, pts[m].y);
            ctx.lineTo(pts[n].x, pts[n].y);
            ctx.stroke();
          }
        }
      }
    };
  };

  // -- Intro de la marca + tilt 3D -----------------------------------------
  KhairoLoader.prototype._initMarkIntro = function () {
    var self = this;
    requestAnimationFrame(function () {
      self.root.classList.add('mark-ready');
    });
  };

  KhairoLoader.prototype._initTilt = function () {
    if (!this.markWrap) return;
    var fine = true;
    try { fine = window.matchMedia('(pointer: fine)').matches; } catch (e) {}
    if (!fine) return;

    var self = this;
    var tx = 0, ty = 0, cx = 0, cy = 0;

    this._boundPointerMove = function (e) {
      var nx = (e.clientX / window.innerWidth - 0.5) * 2;
      var ny = (e.clientY / window.innerHeight - 0.5) * 2;
      tx = nx * 10;
      ty = ny * 10;
    };
    window.addEventListener('pointermove', this._boundPointerMove);

    function animateTilt() {
      cx = lerp(cx, tx, 0.08);
      cy = lerp(cy, ty, 0.08);
      self.markWrap.style.transform = 'rotateX(' + (-cy).toFixed(2) + 'deg) rotateY(' + cx.toFixed(2) + 'deg)';
      if (!self.exited) requestAnimationFrame(animateTilt);
    }
    requestAnimationFrame(animateTilt);
  };

  // -- Texto tipo "decode" --------------------------------------------------
  KhairoLoader.prototype._setStatus = function (text, instant) {
    if (!this.statusEl) return;
    if (this.opts.reducedMotion || instant === true) {
      if (this._decodeTimer) clearInterval(this._decodeTimer);
      this.statusEl.textContent = text;
      return;
    }
    this._decodeText(this.statusEl, text);
  };

  KhairoLoader.prototype._decodeText = function (el, newText) {
    if (this._decodeTimer) clearInterval(this._decodeTimer);
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&';
    var len = newText.length;
    var frame = 0;
    var totalFrames = 14;
    this._decodeTimer = setInterval(function () {
      var out = '';
      for (var i = 0; i < len; i++) {
        var revealFrame = (i / len) * totalFrames;
        if (frame >= revealFrame) {
          out += newText[i];
        } else {
          out += chars[Math.floor(Math.random() * chars.length)];
        }
      }
      el.textContent = out;
      frame++;
      if (frame > totalFrames) {
        el.textContent = newText;
        clearInterval(this._decodeTimer);
      }
    }.bind(this), 28);
  };

  // -- Loop principal ---------------------------------------------------
  KhairoLoader.prototype._loop = function (time) {
    if (this.startTime === null) this.startTime = time;
    var elapsed = time - this.startTime;

    if (this.gl) {
      this.gl.uniform2f(this.uResolution, this.bgCanvas.width, this.bgCanvas.height);
      this.gl.uniform1f(this.uTime, elapsed * 0.001);
      this.gl.uniform1f(this.uProgress, this.displayProgress / 100);
      this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    } else if (this._fallbackDraw) {
      this._fallbackDraw();
    }

    this.displayProgress = lerp(this.displayProgress, this.progress, 0.09);
    if (Math.abs(this.displayProgress - this.progress) < 0.05) {
      this.displayProgress = this.progress;
    }
    this._renderProgress(this.displayProgress);

    if (!this.opts.reducedMotion) {
      var spinDuration = lerp(5.5, 1.6, this.displayProgress / 100);
      this.root.style.setProperty('--khairo-spin', spinDuration.toFixed(2) + 's');
    }

    if (!this.exited) {
      this.rafId = requestAnimationFrame(this._loop);
    }
  };

  KhairoLoader.prototype._renderProgress = function (value) {
    var rounded = Math.round(clamp(value, 0, 100));
    var str = String(rounded);
    while (str.length < 3) str = '0' + str;
    if (this.digitStrips) {
      for (var i = 0; i < 3; i++) {
        this.digitStrips[i].style.setProperty('--d', str[i]);
      }
    }
    if (this.barFill) this.barFill.style.width = rounded + '%';
    if (this.progressbarEl) this.progressbarEl.setAttribute('aria-valuenow', String(rounded));
  };

  // -- API pública: progreso ------------------------------------------------
  KhairoLoader.prototype.setProgress = function (value) {
    this.progress = clamp(value, 0, 100);
  };

  KhairoLoader.prototype.startSimulated = function () {
    var self = this;
    var total = this.opts.minDuration;
    var start = performance.now();
    var messages = this.opts.messages;
    var lastMsgIdx = -1;

    function tick(now) {
      var t = clamp((now - start) / total, 0, 1);
      var eased = Easing.easeOutExpo(t);
      self.setProgress(eased * 100);

      var msgIdx = Math.min(messages.length - 1, Math.floor(t * messages.length));
      if (msgIdx !== lastMsgIdx) {
        lastMsgIdx = msgIdx;
        self._setStatus(messages[msgIdx]);
      }

      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        self.setProgress(100);
        self._setStatus(messages[messages.length - 1]);
        self.complete();
      }
    }
    requestAnimationFrame(tick);
  };

  // Progreso real basado en bytes descargados (Fetch + ReadableStream).
  // Si el servidor no envía Content-Length, ese asset cuenta como "todo o nada".
  KhairoLoader.prototype.trackAssets = function (urls) {
    var self = this;
    if (!urls || !urls.length) {
      this.startSimulated();
      return Promise.resolve();
    }

    var fractions = new Array(urls.length).fill(0);
    function updateTotal() {
      var sum = 0;
      for (var i = 0; i < fractions.length; i++) sum += fractions[i];
      self.setProgress((sum / fractions.length) * 100);
    }

    function loadOne(url, idx) {
      return fetch(url).then(function (res) {
        var lengthHeader = res.headers.get('content-length');
        if (!res.body || !lengthHeader) {
          return res.blob().then(function () {
            fractions[idx] = 1;
            updateTotal();
          });
        }
        var total = parseInt(lengthHeader, 10);
        var loaded = 0;
        var reader = res.body.getReader();
        function pump() {
          return reader.read().then(function (result) {
            if (result.done) {
              fractions[idx] = 1;
              updateTotal();
              return;
            }
            loaded += result.value.length;
            fractions[idx] = total ? clamp(loaded / total, 0, 1) : 1;
            updateTotal();
            return pump();
          });
        }
        return pump();
      }).catch(function () {
        fractions[idx] = 1;
        updateTotal();
      });
    }

    this._setStatus('Descargando recursos');
    return Promise.all(urls.map(loadOne)).then(function () {
      self._setStatus('Listo');
      self.setProgress(100);
      self.complete();
    });
  };

  // -- Finalización y salida -------------------------------------------------
  KhairoLoader.prototype.complete = function () {
    if (this._completing) return;
    this._completing = true;
    var elapsed = performance.now() - this._initTime;
    var remaining = Math.max(0, this.opts.minDuration - elapsed);
    var self = this;
    setTimeout(function () { self._exit(); }, remaining + 260);
  };

  KhairoLoader.prototype._exit = function () {
    if (this.exited) return;
    this.exited = true;
    if (this.rafId) cancelAnimationFrame(this.rafId);

    this.root.classList.add('exiting');

    if (!this.opts.reducedMotion) {
      var ping = document.createElement('div');
      ping.className = 'khairo-shockwave';
      this.root.appendChild(ping);
    }

    var self = this;
    setTimeout(function () {
      self.root.classList.add('hide');
      self._cleanup();
      if (self.opts.onComplete) self.opts.onComplete();
    }, this.opts.reducedMotion ? 0 : 140);
  };

  KhairoLoader.prototype._cleanup = function () {
    if (this._decodeTimer) clearInterval(this._decodeTimer);
    if (this._boundResize) window.removeEventListener('resize', this._boundResize);
    if (this._boundPointerMove) window.removeEventListener('pointermove', this._boundPointerMove);
    if (this._boundVisibility) document.removeEventListener('visibilitychange', this._boundVisibility);
    if (this.gl) {
      var ext = this.gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    }
    var root = this.root;
    setTimeout(function () {
      if (root && root.parentNode) root.parentNode.removeChild(root);
    }, 1100);
  };

  KhairoLoader.prototype.destroy = function () {
    this._exit();
  };

  global.KhairoLoader = KhairoLoader;
})(window);
