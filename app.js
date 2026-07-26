let artistsData = {};

const artistTriggerBtn = document.getElementById("artistTriggerBtn");

// Global image fallback handler
window.handleImageError = function(imgElement) {
  imgElement.style.display = "none";
  const fallback = document.getElementById("artistPhotoFallback");
  if (fallback) fallback.style.display = "flex";
};

// Fetch the artist dataset directly as JSON
fetch("artists_dataset.json")
  .then(r => r.json())
  .then(data => {
    data.forEach(artist => {
      const nameKey = artist.artistname ? artist.artistname.trim() : "";
      if (nameKey) {
        artistsData[nameKey] = {
          name: artist.artistname,
          birthYear: artist.birthdate,
          deathYear: artist["death date"],
          nationality: artist.nationality,
          bio: artist["biography text"],
          photo: artist.images || artist.photo || ""
        };
      }
    });
    console.log("Loaded artists JSON:", artistsData);
  })
  .catch(err => console.error("Could not load artists dataset:", err));

const canvas = document.getElementById("wheel");
const ctx = canvas.getContext("2d");

const themeTitle = document.getElementById("themeTitle");
const artworkCount = document.getElementById("artworkCount");
const modal = document.getElementById("modal");

const artImage = document.getElementById("artImage");
const artTitle = document.getElementById("artTitle");
const artYear = document.getElementById("artYear");
const artMedium = document.getElementById("artMedium");
const artDimensions = document.getElementById("artDimensions");

const swatches = document.getElementById("swatches");

let artworks = [];
let visibleTheme = "All";

let points = [];
let zoom = 1;

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;

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

      document.querySelectorAll("[data-theme]").forEach(btn => btn.classList.remove("active"));
      button.classList.add("active");

      draw();
    });
  });

canvas.addEventListener("wheel", event => {
  event.preventDefault();

  if (event.deltaY < 0) {
    zoom = Math.min(MAX_ZOOM, zoom * 1.1);
  } else {
    zoom = Math.max(MIN_ZOOM, zoom / 1.1);
  }
  console.log("zoom =", zoom);

  draw();
});

function drawColourWheel() {
  const centreX = canvas.width / 2;
  const centreY = canvas.height / 2;
  const maxRadius = 360;

  // Smooth, high-fidelity hue wheel rendering with clean radial gradients
  for (let angle = 0; angle < 360; angle += 1) {
    const normalizedAngle = (angle - 90) * Math.PI / 180;
    const startAngle = (angle - 1.5 - 90) * Math.PI / 180;
    const endAngle = normalizedAngle;

    const gradient = ctx.createRadialGradient(
      centreX,
      centreY,
      0,
      centreX,
      centreY,
      maxRadius
    );

    // Clean neutral center fading smoothly into deep, vibrant outer saturation
    gradient.addColorStop(0, "rgba(255, 255, 255, 0.98)");
    gradient.addColorStop(0.2, `hsla(${angle}, 30%, 92%, 0.5)`);
    gradient.addColorStop(0.6, `hsla(${angle}, 75%, 70%, 0.75)`);
    gradient.addColorStop(1, `hsla(${angle}, 95%, 52%, 0.92)`);

    ctx.beginPath();
    ctx.moveTo(centreX, centreY);
    ctx.arc(centreX, centreY, maxRadius, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  // Elegant, subtle saturation rings
  [0.25, 0.5, 0.75, 1].forEach(ring => {
    ctx.beginPath();
    ctx.arc(centreX, centreY, maxRadius * ring, 0, Math.PI * 2);
    ctx.strokeStyle = ring === 1
      ? "rgba(255, 255, 255, 0.5)"
      : "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = ring === 1 ? 2 : 1;
    ctx.stroke();
  });

  // Soft crosshair guide lines
  ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
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

  ctx.fillStyle = "rgba(70, 70, 70, 0.65)";
  ctx.font = "500 11px system-ui, sans-serif";
  ctx.textAlign = "center";

  ctx.fillText("Low Saturation", centreX, centreY + 16);
  ctx.fillText("High Saturation", centreX, centreY - maxRadius - 14);
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
  ctx.fillStyle = "rgba(40, 40, 40, 0.85)";

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
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  points = [];

  const centreX = canvas.width / 2;
  const centreY = canvas.height / 2;

  ctx.save();

  ctx.translate(centreX, centreY);
  ctx.scale(zoom, zoom);
  ctx.translate(-centreX, -centreY);

  drawColourWheel();

  const radius = 350;

  ctx.beginPath();
  ctx.arc(centreX, centreY, radius, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  const visibleArtworks = visibleTheme === "All"
    ? artworks
    : artworks.filter(a => a.theme === visibleTheme);

  themeTitle.textContent = visibleTheme === "All" ? "All Artworks Palette" : `${visibleTheme} Palette`;
  artworkCount.textContent = `${visibleArtworks.length} artworks`;

  visibleArtworks.forEach((artwork, artworkIndex) => {
    artwork.dominantColours.forEach((colour, colourIndex) => {
      const angle = (colour.hue - 90) * Math.PI / 180;
      const distance = Math.max(35, colour.saturation * radius);

      const jitter = artworkIndex * 7 + colourIndex * 13;
      const jitterX = Math.cos(jitter) * 8;
      const jitterY = Math.sin(jitter) * 8;

      const x = centreX + Math.cos(angle) * distance + jitterX;
      const y = centreY + Math.sin(angle) * distance + jitterY;

      const dotRadius = 9 + colour.percentage * 0.15;

      // Drop-shadow effect for visual depth
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.25)";
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2;

      ctx.beginPath();
      ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = colour.hex;
      ctx.fill();
      ctx.restore();

      // Crisp inner border for definition
      ctx.beginPath();
      ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();

      points.push({
        x,
        y,
        radius: dotRadius + 4,
        artwork
      });
    });
  });

  ctx.restore();
}

canvas.addEventListener("click", event => {
  const rect = canvas.getBoundingClientRect();

  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  const canvasX = (event.clientX - rect.left) * scaleX;
  const canvasY = (event.clientY - rect.top) * scaleY;

  const centreX = canvas.width / 2;
  const centreY = canvas.height / 2;

  const x = (canvasX - centreX) / zoom + centreX;
  const y = (canvasY - centreY) / zoom + centreY;

  points.forEach(point => {
    const dx = x - point.x;
    const dy = y - point.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < point.radius) {
      showArtwork(point.artwork);
    }
  });
});

function showArtwork(artwork) {
  modal.classList.remove("hidden");

  artImage.src = artwork.image;
  artTitle.textContent = artwork.title;
  artistTriggerBtn.textContent = artwork.artist || "Unknown Artist";
  artYear.textContent = artwork.year;
  artMedium.textContent = artwork.medium;
  artDimensions.textContent = artwork.dimensions;

  swatches.innerHTML = "";

  artwork.dominantColours.forEach(colour => {
    const div = document.createElement("div");
    div.className = "swatch";
    div.style.background = colour.hex;
    div.title = `${colour.hex}\n${colour.percentage}%`;

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

    swatches.appendChild(div);
  });
}

// --- ARTIST DRAWER INTERACTIONS ---
const artworkView = document.getElementById("artworkView");
const artistView = document.getElementById("artistView");
const backToArtBtn = document.getElementById("backToArtBtn");

const artistPhoto = document.getElementById("artistPhoto");
const artistName = document.getElementById("artistName");
const artistVital = document.getElementById("artistVital");
const artistBio = document.getElementById("artistBio");

function showArtist(nameInput) {
  const currentArtistName = nameInput.trim();
  let info = artistsData[currentArtistName];

  if (!info) {
    const foundKey = Object.keys(artistsData).find(
      key => key.toLowerCase() === currentArtistName.toLowerCase()
    );
    if (foundKey) info = artistsData[foundKey];
  }

  const imgElement = document.getElementById("artistPhoto");
  const fallback = document.getElementById("artistPhotoFallback");

  if (info) {
    artistName.textContent = info.name || currentArtistName;
    artistVital.textContent = `${info.birthYear || "?"} – ${info.deathYear || "Present"} • ${info.nationality || ""}`;
    artistBio.textContent = info.bio || "No biography available for this artist yet.";

    if (info.photo && info.photo.trim() !== "") {
      imgElement.style.display = "block";
      if (fallback) fallback.style.display = "none";
      imgElement.src = info.photo;
    } else {
      imgElement.style.display = "none";
      if (fallback) fallback.style.display = "flex";
    }
  } else {
    artistName.textContent = currentArtistName;
    artistVital.textContent = "Artist record not found in dataset.";
    artistBio.textContent = `Could not find a match for "${currentArtistName}" in artistsData.`;
    imgElement.style.display = "none";
    if (fallback) fallback.style.display = "flex";
  }

  artworkView.classList.remove("active");
  artistView.classList.add("active");
}

artistTriggerBtn.addEventListener("click", () => {
  showArtist(artistTriggerBtn.textContent);
});

backToArtBtn.addEventListener("click", () => {
  artistView.classList.remove("active");
  artworkView.classList.add("active");
});

document.getElementById("closeBtn").addEventListener("click", () => {
  modal.classList.add("hidden");
  artistView.classList.remove("active");
  artworkView.classList.add("active");
});

// --- RFID POLLING SCRIPT ---
setInterval(async () => {
  try {
    const response = await fetch("http://10.11.21.21:5000/get-theme");
    const data = await response.json();
    
    if (data.theme && data.theme !== visibleTheme) {
      visibleTheme = data.theme;
      
      document.querySelectorAll("[data-theme]").forEach(button => {
        if (button.dataset.theme === visibleTheme) {
          button.classList.add("active");
        } else {
          button.classList.remove("active");
        }
      });

      draw();
    }
  } catch (error) {
    console.debug("Waiting for RFID server connection...");
  }
}, 2000);