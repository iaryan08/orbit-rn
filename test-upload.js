
async function test() {
    const fs = require('fs');
    fs.writeFileSync('test.png', 'fake image data');
    const fileBuf = fs.readFileSync('test.png');
    const blob = new Blob([fileBuf], { type: 'image/png' });
    const formData = new FormData();
    formData.append('bucket', 'memories');
    formData.append('path', 'polaroids/test-route-123/image.png');
    formData.append('contentType', 'image/png');
    formData.append('file', blob, 'test.png');

    console.log('Posting to http://localhost:3000/api/media/upload');
    const res = await fetch('http://localhost:3000/api/media/upload', {
        method: 'POST',
        body: formData,
        // Mock authorization using my local token if needed, or bypass depending on requireUser
    });
    console.log('Upload Status:', res.status, await res.text());
}
test().catch(console.error);

