const AdmZip = require('adm-zip');
const { parseStringPromise } = require('xml2js');
const fs = require('fs');
const path = require('path');
const getTempDir = () => {
  try {
    const os = require('os');
    return os.tmpdir();
  } catch (err) {
    return path.join(__dirname, 'temp');
  }
};
function getShapes(node) {
  let shapes = [];
  if (node['p:sp']) {
    let sp = node['p:sp'];
    if (!Array.isArray(sp)) sp = [sp];
    shapes.push(...sp);
  }
  if (node['p:grpSp']) {
    let grpShapes = node['p:grpSp'];
    if (!Array.isArray(grpShapes)) grpShapes = [grpShapes];
    for (const grpShape of grpShapes) {
      const spTree = grpShape['p:spTree'];
      if (spTree) {
        shapes.push(...getShapes(spTree));
      }
    }
  }
  if (node['p:pic']) {
    let pic = node['p:pic'];
    if (!Array.isArray(pic)) pic = [pic];
    shapes.push(...pic);
  }
  if (node['p:graphicFrame']) {
    let gf = node['p:graphicFrame'];
    if (!Array.isArray(gf)) gf = [gf];
    shapes.push(...gf);
  }
  return shapes;
}
function emuToPercent(value, totalEMUs) {
  return (value / totalEMUs) * 100;
}
function processTextBody(txBody, colorMap) {
  let paragraphs = txBody['a:p'] || [];
  if (!Array.isArray(paragraphs)) paragraphs = [paragraphs];
  let html = '';
  for (const p of paragraphs) {
    const pPr = p['a:pPr'];
    let alignment = pPr ? pPr['$'].algn || 'left' : 'left';
    html += `<p style="text-align: ${alignment}; margin: 0;">`;
    let runs = p['a:r'] || [];
    if (!Array.isArray(runs)) runs = [runs];
    for (const r of runs) {
      const rPr = r['a:rPr'];
      const text = r['a:t'] || '';
      let style = '';
      if (rPr) {
        const sz = rPr['$'].sz;
        if (sz) {
          const sizePoints = parseInt(sz) / 100;
          style += `font-size: ${sizePoints}pt; `;
        }
        const clr = rPr['a:solidFill'];
        if (clr && clr['a:srgbClr']) {
          style += `color: #${clr['a:srgbClr']['$'].val}; `;
        } else if (clr && clr['a:schemeClr']) {
          const schemeColor = clr['a:schemeClr']['$'].val;
          if (colorMap[schemeColor]) {
            style += `color: #${colorMap[schemeColor]}; `;
          }
        }
        if (rPr['$'].b === '1') style += 'font-weight: bold; ';
        if (rPr['$'].i === '1') style += 'font-style: italic; ';
        if (rPr['$'].u === 'sng') style += 'text-decoration: underline; ';
      }
      if (style) {
        html += `<span style="${style}">${text}</span>`;
      } else {
        html += text;
      }
    }
    html += '</p>';
  }
  return html;
}
function processImage(pic, mediaMap, xfrm, tempDir) {
  const blipFill = pic['p:blipFill'];
  if (blipFill && blipFill['a:blip']) {
    const embedId = blipFill['a:blip']['$']['r:embed'];
    const mediaPath = `ppt/media/${embedId}`;
    if (mediaMap.has(mediaPath)) {
      const tempPath = mediaMap.get(mediaPath);
      const fileExtension = path.extname(tempPath).substring(1).toLowerCase();
      const mimeType = { jpg: 'jpeg', jpeg: 'jpeg', png: 'png', gif: 'gif', bmp: 'bmp' }[fileExtension] || 'jpeg';
      const imgData = fs.readFileSync(tempPath, 'base64');
      const imgSrc = `data:image/${mimeType};base64,${imgData}`;
      const x = parseInt(xfrm['a:off']['$'].x);
      const y = parseInt(xfrm['a:off']['$'].y);
      const cx = parseInt(xfrm['a:ext']['$'].cx);
      const cy = parseInt(xfrm['a:ext']['$'].cy);
      return { html: `<img src="${imgSrc}" alt="Slide image">`, style: `position: absolute; left: ${emuToPercent(x, 12700000)}%; top: ${emuToPercent(y, 9525000)}%; width: ${emuToPercent(cx, 12700000)}%; height: ${emuToPercent(cy, 9525000)}%; object-fit: contain;` };
    }
  }
  return { html: '', style: '' };
}
function processShape(shape, slideWidthEMUs, slideHeightEMUs, mediaMap, colorMap, tempDir) {
  const spPr = shape['p:spPr'];
  if (!spPr) return '';
  const xfrm = spPr['a:xfrm'] || {};
  const x = xfrm['a:off'] ? parseInt(xfrm['a:off']['$'].x) : 0;
  const y = xfrm['a:off'] ? parseInt(xfrm['a:off']['$'].y) : 0;
  const cx = xfrm['a:ext'] ? parseInt(xfrm['a:ext']['$'].cx) : 0;
  const cy = xfrm['a:ext'] ? parseInt(xfrm['a:ext']['$'].cy) : 0;
  const left = emuToPercent(x, slideWidthEMUs);
  const top = emuToPercent(y, slideHeightEMUs);
  const width = emuToPercent(cx, slideWidthEMUs);
  const height = emuToPercent(cy, slideHeightEMUs);
  let style = `position: absolute; left: ${left}%; top: ${top}%; width: ${width}%; height: ${height}%;`;
  const fill = spPr['a:solidFill'];
  if (fill) {
    if (fill['a:srgbClr']) {
      style += `background-color: #${fill['a:srgbClr']['$'].val}; `;
    } else if (fill['a:schemeClr']) {
      const schemeColor = fill['a:schemeClr']['$'].val;
      if (colorMap[schemeColor]) {
        style += `background-color: #${colorMap[schemeColor]}; `;
      }
    }
  }
  const ln = spPr['a:ln'];
  if (ln && ln['a:solidFill'] && ln['a:solidFill']['a:srgbClr']) {
    const borderWidth = ln['$'].w ? parseInt(ln['$'].w) / 9525 : 1;
    style += `border: ${borderWidth}px solid #${ln['a:solidFill']['a:srgbClr']['$'].val}; `;
  }
  let html = `<div class="shape" style="${style}">`;
  if (shape['p:txBody']) {
    const textHtml = processTextBody(shape['p:txBody'], colorMap);
    html += `<div contenteditable="true" style="width:100%; height:100%; overflow:auto; padding:5px; box-sizing:border-box;">${textHtml}</div>`;
  } else if (shape['p:pic']) {
    const imgData = processImage(shape, mediaMap, xfrm, tempDir);
    html = `<div class="shape" style="${imgData.style}">${imgData.html}</div>`;
  } else {
    html += '';
  }
  html += '</div>';
  return html;
}
function renderSlideHtml(parsedSlide, slideWidthEMUs, slideHeightEMUs, mediaMap, colorMap, tempDir) {
  const spTree = parsedSlide['p:sld']['p:cSld']['p:spTree'] || {};
  const allShapes = getShapes(spTree);
  const heightPercentage = (slideHeightEMUs / slideWidthEMUs) * 100;
  let html = `<div class="slide" style="position: relative; width: 100%; padding-top: ${heightPercentage}%; overflow: visible;">`;
  const bg = parsedSlide['p:sld']['p:cSld']['p:bg'];
  if (bg) {
    const bgPr = bg['p:bgPr'];
    if (bgPr) {
      const fill = bgPr['a:solidFill'];
      if (fill && fill['a:srgbClr']) {
        html = `<div class="slide" style="position: relative; width: 100%; padding-top: ${heightPercentage}%; background-color: #${fill['a:srgbClr']['$'].val}; overflow: visible;">`;
      } else if (bgPr['a:blipFill']) {
        const blip = bgPr['a:blipFill']['a:blip'];
        if (blip) {
          const embedId = blip['$']['r:embed'];
          const mediaPath = `ppt/media/${embedId}`;
          if (mediaMap.has(mediaPath)) {
            const tempPath = mediaMap.get(mediaPath);
            const fileExtension = path.extname(tempPath).substring(1).toLowerCase();
            const mimeType = { jpg: 'jpeg', jpeg: 'jpeg', png: 'png', gif: 'gif', bmp: 'bmp' }[fileExtension] || 'jpeg';
            const imgData = fs.readFileSync(tempPath, 'base64');
            const imgSrc = `data:image/${mimeType};base64,${imgData}`;
            html = `<div class="slide" style="position: relative; width: 100%; padding-top: ${heightPercentage}%; background-image: url('${imgSrc}'); background-size: cover; overflow: visible;">`;
          }
        }
      }
    }
  }
  for (const shape of allShapes) {
    if (shape['p:spPr']) {
      html += processShape(shape, slideWidthEMUs, slideHeightEMUs, mediaMap, colorMap, tempDir);
    } else if (shape['p:graphicFrame']) {
      const xfrm = shape['p:xfrm'] || {};
      const x = xfrm['a:off'] ? parseInt(xfrm['a:off']['$'].x) : 0;
      const y = xfrm['a:off'] ? parseInt(xfrm['a:off']['$'].y) : 0;
      const cx = xfrm['a:ext'] ? parseInt(xfrm['a:ext']['$'].cx) : 0;
      const cy = xfrm['a:ext'] ? parseInt(xfrm['a:ext']['$'].cy) : 0;
      const left = emuToPercent(x, slideWidthEMUs);
      const top = emuToPercent(y, slideHeightEMUs);
      const width = emuToPercent(cx, slideWidthEMUs);
      const height = emuToPercent(cy, slideHeightEMUs);
      html += `<div style="position: absolute; left: ${left}%; top: ${top}%; width: ${width}%; height: ${height}%; background-color: #eee; display: flex; align-items: center; justify-content: center;">Graphic Frame</div>`;
    }
  }
  html += '</div>';
  return html;
}
async function pptxToHtml(pptxInput) {
  try {
    let zip;
    if (Buffer.isBuffer(pptxInput)) {
      zip = new AdmZip(pptxInput);
    } else if (typeof pptxInput === 'string') {
      zip = new AdmZip(pptxInput);
    } else {
      throw new Error('Invalid PPTX input. Provide a file path or Buffer.');
    }
    const presentationEntry = zip.getEntry('ppt/presentation.xml');
    let slideWidthEMUs = 12700000;
    let slideHeightEMUs = 9525000;
    if (presentationEntry) {
      const presentationContent = presentationEntry.getData().toString('utf8');
      const parsedPresentation = await parseStringPromise(presentationContent, { explicitArray: false });
      const sldSz = parsedPresentation['p:presentation']['p:sldSz'];
      if (sldSz) {
        slideWidthEMUs = parseInt(sldSz['$'].cx);
        slideHeightEMUs = parseInt(sldSz['$'].cy);
      }
    }
    const themeEntry = zip.getEntry('ppt/theme/theme1.xml');
    let colorMap = {};
    if (themeEntry) {
      const themeContent = themeEntry.getData().toString('utf8');
      const parsedTheme = await parseStringPromise(themeContent, { explicitArray: false });
      const clrScheme = parsedTheme['a:theme']['a:themeElements']['a:clrScheme'];
      for (const colorName in clrScheme) {
        if (clrScheme[colorName]['a:srgbClr']) {
          colorMap[colorName] = clrScheme[colorName]['a:srgbClr']['$'].val;
        }
      }
    }
    const slideEntries = zip.getEntries().filter(entry =>
      entry.entryName.startsWith('ppt/slides/slide') && entry.entryName.endsWith('.xml')
    );
    const mediaEntries = zip.getEntries().filter(entry =>
      entry.entryName.startsWith('ppt/media/')
    );
    const tempDir = getTempDir();
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const mediaMap = new Map();
    mediaEntries.forEach(entry => {
      const fileName = entry.entryName.split('/').pop();
      const tempPath = path.join(tempDir, fileName);
      fs.writeFileSync(tempPath, entry.getData());
      mediaMap.set(entry.entryName, tempPath);
    });
    const htmlSlides = [];
    for (const entry of slideEntries) {
      try {
        const xmlContent = entry.getData().toString('utf8');
        const parsedSlide = await parseStringPromise(xmlContent, { explicitArray: false });
        const spTree = parsedSlide['p:sld']['p:cSld']['p:spTree'] || {};
        const allShapes = getShapes(spTree);
        const html = renderSlideHtml(parsedSlide, slideWidthEMUs, slideHeightEMUs, mediaMap, colorMap, tempDir);
        htmlSlides.push(html);
      } catch (slideErr) {
        console.error(`Error processing slide ${entry.name}: ${slideErr.message}`);
      }
    }
    mediaEntries.forEach(entry => {
      const fileName = entry.entryName.split('/').pop();
      const tempPath = path.join(tempDir, fileName);
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    });
    if (fs.existsSync(tempDir) && fs.readdirSync(tempDir).length === 0) {
      fs.rmdirSync(tempDir);
    }
    return htmlSlides;
  } catch (err) {
    throw new Error(`Failed to process PPTX file: ${err.message}`);
  }
}
module.exports = pptxToHtml;
