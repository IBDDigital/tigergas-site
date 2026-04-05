// Cloudflare Worker - Gallery Manager
// R2 Binding: GALLERY_BUCKET
// Custom domain: gallery.tigergas.co.uk
// Cloudflare OTP rule handles authentication

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS for the main site to fetch image list
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    // GET / - Admin panel
    if (path === '/' && request.method === 'GET') {
      return new Response(adminHTML(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // GET /api/list - List all images (used by admin panel and gallery page)
    if (path === '/api/list') {
      const listed = await env.GALLERY_BUCKET.list();
      const images = listed.objects
        .filter(function (obj) {
          return /\.(jpg|jpeg|png|webp|gif)$/i.test(obj.key);
        })
        .sort(function (a, b) {
          return new Date(b.uploaded) - new Date(a.uploaded);
        })
        .map(function (obj) {
          return {
            key: obj.key,
            url: url.origin + '/images/' + obj.key,
            size: obj.size,
            uploaded: obj.uploaded,
          };
        });
      return new Response(JSON.stringify(images), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // POST /api/upload - Upload image(s)
    if (path === '/api/upload' && request.method === 'POST') {
      const formData = await request.formData();
      const files = formData.getAll('files');
      const results = [];

      for (const file of files) {
        if (!file.name) continue;
        // Clean filename: lowercase, replace spaces with hyphens
        const clean = file.name.toLowerCase().replace(/\s+/g, '-');
        await env.GALLERY_BUCKET.put(clean, file.stream(), {
          httpMetadata: { contentType: file.type },
        });
        results.push(clean);
      }

      return new Response(JSON.stringify({ uploaded: results }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // DELETE /api/delete?key=filename.jpg - Delete an image
    if (path === '/api/delete' && request.method === 'DELETE') {
      const key = url.searchParams.get('key');
      if (!key) {
        return new Response(JSON.stringify({ error: 'Missing key' }), {
          status: 400,
          headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }
      await env.GALLERY_BUCKET.delete(key);
      return new Response(JSON.stringify({ deleted: key }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // GET /images/filename.jpg - Serve image from R2
    if (path.startsWith('/images/')) {
      const key = path.replace('/images/', '');
      const object = await env.GALLERY_BUCKET.get(key);
      if (!object) {
        return new Response('Not found', { status: 404 });
      }
      return new Response(object.body, {
        headers: {
          'Content-Type': object.httpMetadata?.contentType || 'image/jpeg',
          'Cache-Control': 'public, max-age=86400',
          ...cors,
        },
      });
    }

    return new Response('Not found', { status: 404 });
  },
};

function adminHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tiger Gas - Gallery Manager</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; color: #333; }

    .header {
      background: #1a1a2e; color: #fff; padding: 20px 32px;
      display: flex; align-items: center; justify-content: space-between;
    }
    .header h1 { font-size: 1.3rem; font-weight: 600; }
    .header h1 span { color: #f47920; }
    .header .count { font-size: .9rem; color: rgba(255,255,255,.6); }

    .wrap { max-width: 1100px; margin: 0 auto; padding: 32px 24px; }

    .dropzone {
      border: 2px dashed #ccc; border-radius: 8px; padding: 48px 24px;
      text-align: center; cursor: pointer; transition: all .2s;
      background: #fff; margin-bottom: 32px;
    }
    .dropzone.over { border-color: #f47920; background: #fff8f0; }
    .dropzone h2 { font-size: 1.1rem; color: #555; margin-bottom: 8px; }
    .dropzone p { font-size: .85rem; color: #999; }
    .dropzone input { display: none; }

    .progress { display: none; margin-bottom: 24px; }
    .progress-bar {
      height: 6px; background: #eee; border-radius: 3px; overflow: hidden;
    }
    .progress-fill {
      height: 100%; background: #f47920; border-radius: 3px;
      transition: width .3s;
    }
    .progress-text { font-size: .8rem; color: #999; margin-top: 6px; }

    .grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 16px;
    }
    .card {
      background: #fff; border-radius: 8px; overflow: hidden;
      box-shadow: 0 1px 6px rgba(0,0,0,.08); position: relative;
    }
    .card img {
      width: 100%; aspect-ratio: 4/3; object-fit: cover; display: block;
    }
    .card-info {
      padding: 10px 12px; display: flex; align-items: center;
      justify-content: space-between;
    }
    .card-name {
      font-size: .75rem; color: #666; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap; max-width: 70%;
    }
    .card-delete {
      background: none; border: none; color: #ccc; cursor: pointer;
      font-size: 1.1rem; padding: 4px; transition: color .2s;
    }
    .card-delete:hover { color: #e74c3c; }

    .empty {
      text-align: center; padding: 60px 20px; color: #999;
    }
    .empty p { font-size: 1rem; }

    .toast {
      position: fixed; bottom: 24px; right: 24px; background: #1a1a2e;
      color: #fff; padding: 12px 20px; border-radius: 6px; font-size: .85rem;
      opacity: 0; transition: opacity .3s; pointer-events: none;
    }
    .toast.show { opacity: 1; }
  </style>
</head>
<body>

<div class="header">
  <h1>Tiger <span>Gas</span> - Gallery Manager</h1>
  <div class="count" id="count"></div>
</div>

<div class="wrap">
  <div class="dropzone" id="dropzone">
    <h2>Drag and drop images here</h2>
    <p>or click to browse - JPG, PNG, WebP, GIF</p>
    <input type="file" id="fileInput" multiple accept="image/jpeg,image/png,image/webp,image/gif">
  </div>

  <div class="progress" id="progress">
    <div class="progress-bar"><div class="progress-fill" id="progressFill"></div></div>
    <div class="progress-text" id="progressText"></div>
  </div>

  <div class="grid" id="grid"></div>
  <div class="empty" id="empty" style="display:none"><p>No images yet. Drag some in above.</p></div>
</div>

<div class="toast" id="toast"></div>

<script>
(function(){
  var grid = document.getElementById('grid');
  var empty = document.getElementById('empty');
  var count = document.getElementById('count');
  var dropzone = document.getElementById('dropzone');
  var fileInput = document.getElementById('fileInput');
  var progress = document.getElementById('progress');
  var progressFill = document.getElementById('progressFill');
  var progressText = document.getElementById('progressText');
  var toast = document.getElementById('toast');

  function showToast(msg){
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(function(){ toast.classList.remove('show'); }, 2500);
  }

  function loadImages(){
    fetch('/api/list')
      .then(function(r){ return r.json(); })
      .then(function(images){
        grid.innerHTML = '';
        count.textContent = images.length + ' image' + (images.length !== 1 ? 's' : '');
        if(!images.length){ empty.style.display = 'block'; return; }
        empty.style.display = 'none';
        images.forEach(function(img){
          var card = document.createElement('div');
          card.className = 'card';
          card.innerHTML =
            '<img src="' + img.url + '" alt="' + img.key + '" loading="lazy">' +
            '<div class="card-info">' +
              '<span class="card-name">' + img.key + '</span>' +
              '<button class="card-delete" title="Delete">&times;</button>' +
            '</div>';
          card.querySelector('.card-delete').onclick = function(){
            if(!confirm('Delete ' + img.key + '?')) return;
            fetch('/api/delete?key=' + encodeURIComponent(img.key), { method: 'DELETE' })
              .then(function(){ showToast('Deleted ' + img.key); loadImages(); });
          };
          grid.appendChild(card);
        });
      });
  }

  function uploadFiles(files){
    var valid = [];
    for(var i = 0; i < files.length; i++){
      if(/^image\\//.test(files[i].type)) valid.push(files[i]);
    }
    if(!valid.length) return;

    var done = 0;
    progress.style.display = 'block';
    progressFill.style.width = '0%';
    progressText.textContent = 'Uploading 0 of ' + valid.length + '...';

    // Upload one at a time to show progress
    function next(){
      if(done >= valid.length){
        progress.style.display = 'none';
        showToast('Uploaded ' + valid.length + ' image' + (valid.length !== 1 ? 's' : ''));
        loadImages();
        return;
      }
      var form = new FormData();
      form.append('files', valid[done]);
      fetch('/api/upload', { method: 'POST', body: form })
        .then(function(){
          done++;
          var pct = Math.round((done / valid.length) * 100);
          progressFill.style.width = pct + '%';
          progressText.textContent = 'Uploading ' + done + ' of ' + valid.length + '...';
          next();
        });
    }
    next();
  }

  // Drag and drop
  dropzone.addEventListener('dragover', function(e){ e.preventDefault(); dropzone.classList.add('over'); });
  dropzone.addEventListener('dragleave', function(){ dropzone.classList.remove('over'); });
  dropzone.addEventListener('drop', function(e){
    e.preventDefault(); dropzone.classList.remove('over');
    uploadFiles(e.dataTransfer.files);
  });
  dropzone.addEventListener('click', function(){ fileInput.click(); });
  fileInput.addEventListener('change', function(){ uploadFiles(fileInput.files); fileInput.value = ''; });

  loadImages();
})();
</script>
</body>
</html>`;
}
