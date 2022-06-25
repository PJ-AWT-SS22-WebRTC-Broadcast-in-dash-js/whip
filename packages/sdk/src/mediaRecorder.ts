const recordedChunks = [];

export function setupMediaRecorder(stream: MediaStream) {
  const timeslice = 5000;
  const mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.ondataavailable = handleDataAvailable;
  mediaRecorder.start(timeslice);
}

function handleDataAvailable(event) {
  console.log("data-available");
  if (event.data.size > 0) {
    recordedChunks.push(event.data);
    pipeToFfmpeg(recordedChunks);
  } else {
    console.log("event.data.size is <= 0.");
  }
}

function pipeToFfmpeg(recordedChunks) {
  console.log(recordedChunks);

  let blob = new Blob(recordedChunks, {
    type: "video/webm;codecs=vp8"
  });
  let video = URL.createObjectURL(blob);
  console.log(video);
}
