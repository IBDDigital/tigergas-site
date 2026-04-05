// Cloudflare Worker - Gallery API
// Lists images from R2 bucket and returns JSON
// R2 Binding: GALLERY_BUCKET (bound to your R2 bucket)
// Environment Variable: R2_PUBLIC_URL (your bucket's public URL)

export default {
  async fetch(request, env) {
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          ...headers,
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    try {
      const listed = await env.GALLERY_BUCKET.list();
      const images = listed.objects
        .filter(function (obj) {
          return /\.(jpg|jpeg|png|webp|gif)$/i.test(obj.key);
        })
        .sort(function (a, b) {
          return new Date(b.uploaded) - new Date(a.uploaded);
        })
        .map(function (obj) {
          return env.R2_PUBLIC_URL + '/' + obj.key;
        });

      return new Response(JSON.stringify(images), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Failed to list images' }), {
        status: 500,
        headers,
      });
    }
  },
};
