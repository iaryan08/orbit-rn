
const url = 'https://orbit-upload.aryan811182.workers.dev/avatars/test-upload.txt';
const secret = '9fK3xLm82QaPz71T';

async function test() {
    console.log('--- PUT ---');
    const putRes = await fetch(url, {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer ' + secret, 'Content-Type': 'text/plain' },
        body: 'hello world 123'
    });
    console.log(putRes.status, await putRes.text());

    console.log('--- GET UPLOAD WORKER ---');
    const getRes = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + secret, 'X-Orbit-R2-Secret': secret }
    });
    console.log(getRes.status, await getRes.text());

    console.log('--- GET CDN WORKER ---');
    const cdnRes = await fetch('https://orbit-cdn.aryan811182.workers.dev/avatars/test-upload.txt');
    console.log(cdnRes.status, await cdnRes.text());
}
test().catch(console.error);

