const canvas = document.getElementById("wheel");
const ctx = canvas.getContext("2d");

const themeTitle =
  document.getElementById("themeTitle");

const artworkCount =
  document.getElementById("artworkCount");
const modal = document.getElementById("modal");

const artImage = document.getElementById("artImage");
const artTitle = document.getElementById("artTitle");
const artArtist = document.getElementById("artArtist");
const artYear = document.getElementById("artYear");
const artMedium = document.getElementById("artMedium");
const artDimensions = document.getElementById("artDimensions");

const swatches = document.getElementById("swatches");

let artworks = [];
let visibleTheme = "Nature";

let points = [];

fetch("artworks.json")
  .then(r => r.json())
  .then(data => {
    artworks = data;
    

    draw();
  });

document
  .querySelectorAll("[data-theme]")
  .forEach(button => {

    button.addEventListener("click", () => {

      visibleTheme = button.dataset.theme;

      draw();

    });

  });
function drawColourWheel() {
  const centreX = canvas.width / 2;
  const centreY = canvas.height / 2;
  const maxRadius = 360;

  // Soft hue wheel
  for (let angle = 0; angle < 360; angle += 1) {
    const startAngle = (angle - 1) * Math.PI / 180;
    const endAngle = angle * Math.PI / 180;

    const gradient = ctx.createRadialGradient(
      centreX,
      centreY,
      0,
      centreX,
      centreY,
      maxRadius
    );

    gradient.addColorStop(0, "rgba(255,255,255,0.96)");
    gradient.addColorStop(0.45, `hsla(${angle}, 80%, 78%, 0.18)`);
    gradient.addColorStop(1, `hsla(${angle}, 90%, 62%, 0.38)`);

    ctx.beginPath();
    ctx.moveTo(centreX, centreY);
    ctx.arc(centreX, centreY, maxRadius, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  // Saturation rings
  [0.25, 0.5, 0.75, 1].forEach(ring => {
    ctx.beginPath();
    ctx.arc(centreX, centreY, maxRadius * ring, 0, Math.PI * 2);
    ctx.strokeStyle = ring === 1
      ? "rgba(90, 90, 90, 0.25)"
      : "rgba(90, 90, 90, 0.10)";
    ctx.lineWidth = ring === 1 ? 2 : 1;
    ctx.stroke();
  });

  // Crosshair guide
  ctx.strokeStyle = "rgba(90, 90, 90, 0.08)";
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.moveTo(centreX - maxRadius, centreY);
  ctx.lineTo(centreX + maxRadius, centreY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(centreX, centreY - maxRadius);
  ctx.lineTo(centreX, centreY + maxRadius);
  ctx.stroke();

  drawHueLabels(centreX, centreY, maxRadius);

  ctx.fillStyle =
  "rgba(60,60,60,0.6)";

    ctx.font =
    "14px sans-serif";

    ctx.textAlign =
    "center";

    ctx.fillText(
    "Low Saturation",
    centreX,
    centreY
    );
    ctx.fillText(
    "High Saturation",
    centreX,
    centreY - maxRadius - 20
    );
}

function drawHueLabels(centreX, centreY, maxRadius) {
  const labels = [
    { text: "Red", hue: 0 },
    { text: "Yellow", hue: 60 },
    { text: "Green", hue: 120 },
    { text: "Cyan", hue: 180 },
    { text: "Blue", hue: 240 },
    { text: "Magenta", hue: 300 }
  ];

  ctx.save();
  ctx.font = "600 14px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(50, 50, 50, 0.58)";

  labels.forEach(label => {
    const angle = (label.hue - 90) * Math.PI / 180;
    const labelRadius = maxRadius + 32;

    const x = centreX + Math.cos(angle) * labelRadius;
    const y = centreY + Math.sin(angle) * labelRadius;

    ctx.fillText(label.text, x, y);
  });

  ctx.restore();
}
function draw() {

  ctx.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );
  drawColourWheel();

  points = [];

  const centreX =
    canvas.width / 2;

  const centreY =
    canvas.height / 2;

  const radius = 350;

  ctx.beginPath();

  ctx.arc(
    centreX,
    centreY,
    radius,
    0,
    Math.PI * 2
  );

  ctx.strokeStyle = "#d0d0d0";
  ctx.lineWidth = 2;
  ctx.stroke();

  const visibleArtworks =
    artworks.filter(a =>
      a.theme === visibleTheme
    );
themeTitle.textContent =
  `${visibleTheme} Palette`;

artworkCount.textContent =
  `${visibleArtworks.length} artworks`;
visibleArtworks.forEach((artwork, artworkIndex) => {

  artwork.dominantColours.forEach((colour, colourIndex) => {

    const angle =
      (colour.hue - 90) * Math.PI / 180;

    const distance =
      Math.max(
        35,
        colour.saturation * radius
      );

    const jitter =
      artworkIndex * 7 +
      colourIndex * 13;

    const jitterX =
      Math.cos(jitter) * 8;

    const jitterY =
      Math.sin(jitter) * 8;

    const x =
      centreX +
      Math.cos(angle) * distance +
      jitterX;

    const y =
      centreY +
      Math.sin(angle) * distance +
      jitterY;

    const dotRadius =
      10 + colour.percentage * 0.15;

    ctx.beginPath();

    ctx.arc(
      x,
      y,
      dotRadius,
      0,
      Math.PI * 2
    );

    ctx.fillStyle =
      colour.hex;

    ctx.fill();

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    points.push({
      x,
      y,
      radius: dotRadius + 4,
      artwork
    });

  });


 

});



}

canvas.addEventListener(
  "click",
  event => {
    console.log("canvas clicked");

    const rect =
      canvas.getBoundingClientRect();

const scaleX =
  canvas.width / rect.width;

const scaleY =
  canvas.height / rect.height;

const x =
  (event.clientX - rect.left) * scaleX;

const y =
  (event.clientY - rect.top) * scaleY;

    points.forEach(point => {

      const dx =
        x - point.x;

      const dy =
        y - point.y;

      const distance =
        Math.sqrt(
          dx * dx +
          dy * dy
        );

      if (distance < point.radius) {

        showArtwork(
          point.artwork
        );

      }

    });

  }
);

function showArtwork(
  artwork
) {

  modal.classList.remove(
    "hidden"
  );

  artImage.src =
    artwork.image;

  artTitle.textContent =
    artwork.title;

  artArtist.textContent =
    artwork.artist;

  artYear.textContent =
    artwork.year;

  artMedium.textContent =
    artwork.medium;

  artDimensions.textContent =
    artwork.dimensions;

  swatches.innerHTML = "";

  artwork.dominantColours
    .forEach(colour => {

      const div =
        document.createElement(
          "div"
        );

      div.className =
        "swatch";

      div.style.background =
        colour.hex;

      div.title =
        `${colour.hex}
${colour.percentage}%`;


// Add click listener to copy color hex code and show feedback inside
    div.addEventListener("click", () => {
      navigator.clipboard.writeText(colour.hex).then(() => {
        div.textContent = "Copied!";
        div.classList.add("copied");

        setTimeout(() => {
          div.textContent = "";
          div.classList.remove("copied");
        }, 1500);
      }).catch(err => {
        console.error("Failed to copy text: ", err);
      });
    });

      swatches.appendChild(
        div
      );

    });

}

document
  .getElementById(
    "closeBtn"
  )
  .addEventListener(
    "click",
    () =>
      modal.classList.add(
        "hidden"
      )
  );