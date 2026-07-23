const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const sharp = require("sharp");

const DATA_FILE = path.join(__dirname, "../data/metadata.csv");
const OUTPUT_FILE = path.join(__dirname, "../public/artworks.json");

const NUMBER_OF_DOMINANT_COLOURS = 6;
const SAMPLE_SIZE = 220;
const COLOUR_BUCKET_SIZE = 22;

const artworks = [];

function clean(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

function rgbToHex(r, g, b) {
  return (
    "#" +
    [r, g, b]
      .map(value => value.toString(16).padStart(2, "0"))
      .join("")
  );
}

function rgbToHsv(r, g, b) {
  r = r / 255;
  g = g / 255;
  b = b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const difference = max - min;

  let hue = 0;
  const saturation = max === 0 ? 0 : difference / max;
  const value = max;

  if (difference !== 0) {
    if (max === r) {
      hue = ((g - b) / difference + (g < b ? 6 : 0)) / 6;
    } else if (max === g) {
      hue = ((b - r) / difference + 2) / 6;
    } else {
      hue = ((r - g) / difference + 4) / 6;
    }
  }

  return {
    hue: hue * 360,
    saturation,
    value
  };
}

function getBrightness(r, g, b) {
  return (r + g + b) / 3;
}

function shouldIgnorePixel(r, g, b) {
  const brightness = getBrightness(r, g, b);
  const hsv = rgbToHsv(r, g, b);

  // Remove very dark shadow/background pixels.
  if (brightness < 42) {
    return true;
  }

  // Remove near-white page/background areas.
  if (brightness > 245) {
    return true;
  }

  // Remove very grey / low-information pixels.
  if (hsv.saturation < 0.10) {
    return true;
  }

  return false;
}

function bucketColour(value) {
  return Math.round(value / COLOUR_BUCKET_SIZE) * COLOUR_BUCKET_SIZE;
}

function getColourScore(colour) {
  /*
    This is the important part.

    We don't want "most pixels" only.
    We want colours that feel visually meaningful.

    percentage = how common it is
    saturation = how colourful it is
    value = how visible/bright it is
  */

  const percentageScore = colour.percentage / 100;
  const saturationScore = colour.saturation;
  const brightnessScore = colour.value;

  return (
    percentageScore * 0.35 +
    saturationScore * 0.45 +
    brightnessScore * 0.20
  );
}

function isSimilarColour(a, b) {
  const hueDifference = Math.abs(a.hue - b.hue);
  const circularHueDifference = Math.min(
    hueDifference,
    360 - hueDifference
  );

  const saturationDifference = Math.abs(a.saturation - b.saturation);
  const valueDifference = Math.abs(a.value - b.value);

  return (
    circularHueDifference < 14 &&
    saturationDifference < 0.18 &&
    valueDifference < 0.18
  );
}

function removeNearDuplicates(colours) {
  const result = [];

  colours.forEach(colour => {
    const alreadyHasSimilarColour = result.some(existingColour =>
      isSimilarColour(existingColour, colour)
    );

    if (!alreadyHasSimilarColour) {
      result.push(colour);
    }
  });

  return result;
}

async function getDominantColours(imagePath) {
  const { data, info } = await sharp(imagePath)
    .resize(SAMPLE_SIZE, SAMPLE_SIZE, {
      fit: "inside",
      withoutEnlargement: true
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  const buckets = new Map();

  let validPixelCount = 0;

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    if (shouldIgnorePixel(r, g, b)) {
      continue;
    }

    validPixelCount++;

    const bucketR = bucketColour(r);
    const bucketG = bucketColour(g);
    const bucketB = bucketColour(b);

    const key = `${bucketR},${bucketG},${bucketB}`;

    if (!buckets.has(key)) {
      buckets.set(key, {
        count: 0,
        totalR: 0,
        totalG: 0,
        totalB: 0
      });
    }

    const bucket = buckets.get(key);

    bucket.count++;
    bucket.totalR += r;
    bucket.totalG += g;
    bucket.totalB += b;
  }

  if (validPixelCount === 0) {
    return [
      {
        r: 120,
        g: 120,
        b: 120,
        hex: "#787878",
        hue: 0,
        saturation: 0,
        value: 0.47,
        percentage: 100,
        score: 0
      }
    ];
  }

  const allColours = Array.from(buckets.values())
    .map(bucket => {
      const r = Math.round(bucket.totalR / bucket.count);
      const g = Math.round(bucket.totalG / bucket.count);
      const b = Math.round(bucket.totalB / bucket.count);

      const hsv = rgbToHsv(r, g, b);

      const colour = {
        r,
        g,
        b,
        hex: rgbToHex(r, g, b),
        hue: hsv.hue,
        saturation: hsv.saturation,
        value: hsv.value,
        percentage: Number(((bucket.count / validPixelCount) * 100).toFixed(1))
      };

      colour.score = getColourScore(colour);

      return colour;
    });

  /*
    Sort by representative score, not just by pixel count.
    This lets red watermelon / green leaves / purple flowers compete
    against big dark backgrounds.
  */
  const representativeColours = allColours
    .filter(colour => {
      return (
        colour.value >= 0.16 &&
        colour.value <= 0.96 &&
        colour.saturation >= 0.12
      );
    })
    .sort((a, b) => b.score - a.score);

  const diverseColours = removeNearDuplicates(representativeColours);

  const finalColours = diverseColours
    .slice(0, NUMBER_OF_DOMINANT_COLOURS)
    .map(colour => ({
      hex: colour.hex,
      hue: colour.hue,
      saturation: colour.saturation,
      value: colour.value,
      percentage: colour.percentage,
      score: Number(colour.score.toFixed(3))
    }));

  if (finalColours.length > 0) {
    return finalColours;
  }

  return allColours
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, NUMBER_OF_DOMINANT_COLOURS)
    .map(colour => ({
      hex: colour.hex,
      hue: colour.hue,
      saturation: colour.saturation,
      value: colour.value,
      percentage: colour.percentage,
      score: Number(colour.score.toFixed(3))
    }));
}

function choosePlotColour(dominantColours) {
  /*
    The wheel dot should use the colour that is most visually expressive,
    not necessarily the largest colour area.
  */

  return dominantColours
    .slice()
    .sort((a, b) => b.score - a.score)[0];
}

function getThemeFolder(theme) {
  return theme.toLowerCase();
}

async function processRow(row) {
  const title = clean(row.WorkName);
  const artist = clean(row.ArtistName);
  const year = clean(row.YearCreated);
  const medium = clean(row.Medium);
  const dimensions = clean(row.Dimensions);
  const accession = clean(row.AquisitionDate);
  const filename = clean(row.ImageLink);
  const theme = clean(row.Themes);

  if (!filename || !theme) {
    console.log("Skipped row because filename or theme is missing:", row);
    return;
  }

  const themeFolder = getThemeFolder(theme);

  const imagePath = path.join(
    __dirname,
    "..",
    "paintings",
    themeFolder,
    filename
  );

  if (!fs.existsSync(imagePath)) {
    console.log(`Missing image: paintings/${themeFolder}/${filename}`);
    return;
  }

  const dominantColours = await getDominantColours(imagePath);
  const plotColour = choosePlotColour(dominantColours);

  artworks.push({
    title,
    artist,
    year,
    medium,
    dimensions,
    accession,
    theme,

    image: `../paintings/${themeFolder}/${filename}`,

    plotColour: plotColour.hex,
    hue: plotColour.hue,
    saturation: plotColour.saturation,
    value: plotColour.value,

    dominantColours
  });
}

async function build() {
  const rows = [];

  fs.createReadStream(DATA_FILE)
    .pipe(
      csv({
        mapHeaders: ({ header }) => header.trim()
      })
    )
    .on("data", row => {
      rows.push(row);
    })
    .on("end", async () => {
      for (const row of rows) {
        await processRow(row);
      }

      fs.writeFileSync(
        OUTPUT_FILE,
        JSON.stringify(artworks, null, 2)
      );

      console.log(`Finished. Generated ${artworks.length} artworks`);
      console.log(`Saved to ${OUTPUT_FILE}`);
    });
}

build();