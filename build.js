const shell = require('shelljs');
const fs = require('fs');
const _ = require('lodash');
const meta = require('./src/meta.js');

const FRAG_PREFIX = 'precision highp float;';

const shortVarNames = _.range(10, 36)
    .map(x => x.toString(36))
    .filter(x => x !== 'g' && x !== 'a');

const stripComments = js => js
    .replace(/\r/g, '')
    .split('\n')
    .map(x => x.trim())
    .filter(x => !x.startsWith('//'))
    .join('\n');

const minifyPrefixedIdentifiers = (prefix, js) => {
    const vars = _.uniq(js
        .match(new RegExp(`[^a-zA-Z0-9_]${prefix}[a-zA-Z0-9_]+`, 'g'))
        .map(x => x.substr(1)));

    vars.sort((a, b) => b.length - a.length);

    vars.forEach((v, i) => {
        js = js.replace(new RegExp('\\'+v, 'g'), shortVarNames[i]);
    });

    return js;
};

const replaceMetaExprs = code => {
    while (code.indexOf('__metaExpr(') >= 0) {
        const match = code.match(/__metaExpr\(['"]([^'"]+)['"]\)/);
        code = code.replace(/__metaExpr\(['"][^'"]+['"]\)/, meta[match[1]]);
    }
    return code;
};

const getMinifiedShader = path => {
    const shaderContents = fs.readFileSync(path, 'utf8');
    fs.writeFileSync('tmp_in.glsl', replaceMetaExprs(shaderContents));

    const SHADER_MIN_TOOL = process.platform === 'win32' ? 'tools\\shader_minifier.exe' : 'mono tools/shader_minifier.exe';
    shell.exec(`${SHADER_MIN_TOOL} --preserve-externals --no-renaming-list main --format none tmp_in.glsl -o tmp_out.glsl`);
    return fs.readFileSync('tmp_out.glsl', 'utf8');
}

const insertShaders = js => {
    while (js.indexOf('__shader(') >= 0) {
        const match = js.match(/__shader\(['"]([^'"]+)['"]\)/);
        let shader = getMinifiedShader('src/' + match[1]);

        if (match[1].endsWith('frag')) {
            shader = FRAG_PREFIX + shader;
        }

        js = js.replace(/__shader\(['"][^'"]+['"]\)/, "'"+shader+"'");
    }
    
    return js;
};

const removeWhitespace = js =>
    js.replace(/[ \t\r\n]+/g, '');

const main = () => {
    let js = fs.readFileSync('src/main.js', 'utf8');

    js = replaceMetaExprs(js);
    js = stripComments(js);
    js = removeWhitespace(js);
    js = insertShaders(js);
    js = minifyPrefixedIdentifiers('\\$', js);
    js = minifyPrefixedIdentifiers('x_', js);

    console.log(js);

    fs.writeFileSync('tmp_in.js', js);

    console.log('');
    shell.exec('regpack --contextType 1 --hashWebGLContext true --contextVariableName g --varsNotReassigned g tmp_in.js > tmp_out.js');
    console.log('');

    const packedJS = fs.readFileSync('tmp_out.js', 'utf8');
    const shimHTML = fs.readFileSync('src/shim.html', 'utf8');

    fs.writeFileSync('index.html', shimHTML.replace('__CODE__', packedJS));

    shell.rm('-rf', 'tmp*.*');
}

main();