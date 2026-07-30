document.addEventListener('DOMContentLoaded', function () {
  document.documentElement.classList.add('khairo-locked');

  var loader = new KhairoLoader({
    root: '#khairo-loader',
    minDuration: 3200,
    messages: [
      'Inicializando sistema',
      'Cargando recursos',
      'Optimizando interfaz',
      'Estableciendo conexión',
      'Listo'
    ],
    onComplete: function () {
      document.documentElement.classList.remove('khairo-locked');
    }
  });

  // Modo demo: progreso simulado con curva de easing realista.
  loader.startSimulated();

  // Para producción con progreso real (bytes descargados de verdad),
  // reemplaza la línea de arriba por algo como:
  //
  // loader.trackAssets([
  //   '/img/hero.jpg',
  //   '/fonts/brand.woff2',
  //   '/js/app.bundle.js'
  // ]);
});
