const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const sharp = require("sharp");

const DATA_FILE = path.join(__dirname, "../data/metadata.csv");
const OUTPUT_FILE = path.join(__dirname, "../public/artworks.json");

// How many colours to keep from each category
const DARK_COLOUR_COUNT = 2;
const MEDIUM_COLOUR_COUNT = 2;
const COLOURFUL_COLOUR_COUNT = 4;

// Image processing settings
const SAMPLE_SIZE = 240;
const COLOUR_BUCKET_SIZE = 18;
const CENTRE_CROP_RATIO = 0.92;

// Filtering settings
const MIN_VISIBLE_BRIGHTNESS = 28;
const MAX_WHITE_BRIGHTNESS = 246;
const MIN_USEFUL_SATURATION = 0.06;

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

function bucketColour(value) {
  return Math.round(value / COLOUR_BUCKET_SIZE) * COLOUR_BUCKET_SIZE;
}

function shouldIgnorePixel(r, g, b) {
  const brightness = getBrightness(r, g, b);
  const hsv = rgbToHsv(r, g, b);

  // Ignore almost-black pixels that are usually deep shadow/noise.
  if (brightness < MIN_VISIBLE_BRIGHTNESS) {
    return true;
  }

  // Ignore near-white background/page/border pixels.
  if (brightness > MAX_WHITE_BRIGHTNESS) {
    return true;
  }

  // Ignore very grey pixels with little colour information.
  if (hsv.saturation < MIN_USEFUL_SATURATION) {
    return true;
  }

  return false;
}

function hueDistance(a, b) {
  const difference = Math.abs(a - b);
  return Math.min(difference, 360 - difference);
}

function isSimilarColour(a, b) {
  const hueDiff = hueDistance(a.hue, b.hue);
  const saturationDiff = Math.abs(a.saturation - b.saturation);
  const valueDiff = Math.abs(a.value - b.value);

  return (
    hueDiff < 16 &&
    saturationDiff < 0.16 &&
    valueDiff < 0.16
  );
}

function removeNearDuplicates(colours) {
  const result = [];

  colours.forEach(colour => {
    const alreadyIncluded = result.some(existingColour =>
      isSimilarColour(existingColour, colour)
    );

    if (!alreadyIncluded) {
      result.push(colour);
    }
  });

  return result;
}

function getDarkScore(colour) {
  const percentageScore = colour.percentage / 100;
  const saturationScore = colour.saturation;
  const darknessScore = 1 - colour.value;

  return (
    percentageScore * 0.35 +
    saturationScore * 0.30 +
    darknessScore * 0.35
  );
}

function getMediumScore(colour) {
  const percentageScore = colour.percentage / 100;
  const saturationScore = colour.saturation;

  const distanceFromMiddle = Math.abs(colour.value - 0.52);
  const middleValueScore = Math.max(0, 1 - distanceFromMiddle * 2);

  return (
    percentageScore * 0.35 +
    saturationScore * 0.25 +
    middleValueScore * 0.40
  );
}

function getColourfulScore(colour) {
  const percentageScore = colour.percentage / 100;
  const saturationScore = colour.saturation;
  const brightnessScore = colour.value;

  return (
    saturationScore * 0.55 +
    brightnessScore * 0.25 +
    percentageScore * 0.20
  );
}

function getOverallRepresentativeScore(colour) {
  const percentageScore = colour.percentage / 100;
  const saturationScore = colour.saturation;
  const brightnessScore = colour.value;

  return (
    saturationScore * 0.45 +
    brightnessScore * 0.25 +
    percentageScore * 0.30
  );
}

function selectTopColours(colours, count, scoreName) {
  const scoredColours = colours
    .map(colour => ({
      ...colour,
      score: Number(colour[scoreName].toFixed(3))
    }))
    .sort((a, b) => b.score - a.score);

  const diverseColours = removeNearDuplicates(scoredColours);

  return diverseColours.slice(0, count);
}

async function getImageBufferData(imagePath) {
  const metadata = await sharp(imagePath).metadata();

  let pipeline = sharp(imagePath).rotate();

  if (metadata.width && metadata.height) {
    const cropWidth = Math.floor(metadata.width * CENTRE_CROP_RATIO);
    const cropHeight = Math.floor(metadata.height * CENTRE_CROP_RATIO);

    const left = Math.floor((metadata.width - cropWidth) / 2);
    const top = Math.floor((metadata.height - cropHeight) / 2);

    pipeline = pipeline.extract({
      left,
      top,
      width: cropWidth,
      height: cropHeight
    });
  }

  return await pipeline
    .resize(SAMPLE_SIZE, SAMPLE_SIZE, {
      fit: "inside",
      withoutEnlargement: true
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

async function getRepresentativeColours(imagePath) {
  const { data, info } = await getImageBufferData(imagePath);

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
        hex: "#787878",
        hue: 0,
        saturation: 0,
        value: 0.47,
        percentage: 100,
        group: "fallback",
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

      colour.darkScore = getDarkScore(colour);
      colour.mediumScore = getMediumScore(colour);
      colour.colourfulScore = getColourfulScore(colour);
      colour.overallScore = getOverallRepresentativeScore(colour);

      return colour;
    });

  const darkCandidates = allColours.filter(colour => {
    return (
      colour.value >= 0.10 &&
      colour.value <= 0.38 &&
      colour.saturation >= 0.08
    );
  });

  const mediumCandidates = allColours.filter(colour => {
    return (
      colour.value > 0.30 &&
      colour.value <= 0.72 &&
      colour.saturation >= 0.07
    );
  });

  const colourfulCandidates = allColours.filter(colour => {
    return (
      colour.value >= 0.22 &&
      colour.value <= 0.96 &&
      colour.saturation >= 0.20
    );
  });

  const selectedDarkColours = selectTopColours(
    darkCandidates,
    DARK_COLOUR_COUNT,
    "darkScore"
  ).map(colour => ({
    ...colour,
    group: "dark"
  }));

  const selectedMediumColours = selectTopColours(
    mediumCandidates,
    MEDIUM_COLOUR_COUNT,
    "mediumScore"
  ).map(colour => ({
    ...colour,
    group: "medium"
  }));

  const selectedColourfulColours = selectTopColours(
    colourfulCandidates,
    COLOURFUL_COLOUR_COUNT,
    "colourfulScore"
  ).map(colour => ({
    ...colour,
    group: "colourful"
  }));

  let combinedColours = [
    ...selectedColourfulColours,
    ...selectedMediumColours,
    ...selectedDarkColours
  ];

  combinedColours = removeNearDuplicates(combinedColours);

  const targetTotal =
    DARK_COLOUR_COUNT +
    MEDIUM_COLOUR_COUNT +
    COLOURFUL_COLOUR_COUNT;

  if (combinedColours.length < targetTotal) {
    const fallbackColours = allColours
      .map(colour => ({
        ...colour,
        group: "fallback",
        score: Number(colour.overallScore.toFixed(3))
      }))
      .sort((a, b) => b.overallScore - a.overallScore);

    fallbackColours.forEach(colour => {
      if (combinedColours.length >= targetTotal) {
        return;
      }

      const alreadyIncluded = combinedColours.some(existingColour =>
        isSimilarColour(existingColour, colour)
      );

      if (!alreadyIncluded) {
        combinedColours.push(colour);
      }
    });
  }

  return combinedColours
    .slice(0, targetTotal)
    .map(colour => ({
      hex: colour.hex,
      hue: colour.hue,
      saturation: colour.saturation,
      value: colour.value,
      percentage: colour.percentage,
      group: colour.group,
      score: Number(
        (
          colour.score ||
          colour.colourfulScore ||
          colour.mediumScore ||
          colour.darkScore ||
          colour.overallScore ||
          0
        ).toFixed(3)
      )
    }));
}

function choosePlotColour(representativeColours) {
  const colourfulColours = representativeColours.filter(colour =>
    colour.group === "colourful"
  );

  if (colourfulColours.length > 0) {
    return colourfulColours
      .slice()
      .sort((a, b) => b.score - a.score)[0];
  }

  return representativeColours
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

  const representativeColours = await getRepresentativeColours(imagePath);
  const plotColour = choosePlotColour(representativeColours);

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

    dominantColours: representativeColours
  });

  console.log(`Processed: ${title} (${theme})`);
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

      console.log("");
      console.log(`Finished. Generated ${artworks.length} artworks`);
      console.log(`Saved to ${OUTPUT_FILE}`);
    });
}

build();