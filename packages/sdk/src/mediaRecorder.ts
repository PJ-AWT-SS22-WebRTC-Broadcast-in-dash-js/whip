import { io } from "socket.io-client";

const recordedChunks = [];
let socket = null;

export function setupMediaRecorder(stream: MediaStream) {
  const timeslice = 5000;
  const mediaRecorder = new MediaRecorder(stream, {
    mimeType: 'video/webm;codecs=h264',
    videoBitsPerSecond: 3 * 1024 * 1024
  });
  mediaRecorder.ondataavailable = handleDataAvailable;
  mediaRecorder.start(timeslice);
  socket = io('http://localhost:3104', {transports: ['websocket'], upgrade: false});
}

function handleDataAvailable(event) {
  console.log("data-available");
  if (event.data.size > 0) {
    recordedChunks.push(event.data);
    socket.emit('data', event.data);
    pipeToFfmpeg(recordedChunks);
  } else {
    console.log("event.data.size is <= 0.");
  }
}

function pipeToFfmpeg(recordedChunks) {
  console.log(recordedChunks);

  let blob = new Blob(recordedChunks, {
    type: "video/webm"
  });
  let video_url = URL.createObjectURL(blob);
  console.log(video_url);
  // downloadVideo(video_url);
  window.URL.revokeObjectURL(video_url);
}

function downloadVideo(video_url) {
  var a = document.createElement('a');
  document.body.appendChild(a);
  //a.style = 'display: none';
  a.href = video_url;
  a.download = 'test.webm';
  a.click();
}