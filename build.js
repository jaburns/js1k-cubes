const shell = require('shelljs');
const fs = require('fs');
const _ = require('lodash');

const SRC_DIR = 'src';
const DO_SECOND_PASS = false;
const FRAG_PREFIX = ''; // '#extension GL_OES_standard_derivatives:enable\\n';

const shortVarNames = _.range(10, 36)
    .map(x => x.toString(36))
    .filter(x => x !== 'g' && x !== 'a');

const stripComments = js => js
    .replace(/\/\*[^\*]*\*\//g, '')
    .replace(/\/\/.*/g, '');

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

const replaceMacros = code => {
    const lines = code.split('\n').map(x => x.trim());
    const outLines = [];

    const macros = {};
    let curMacroName = null;
    let curMacroBody = '';

    lines.forEach(line => {
        if (curMacroName === null) {
            const match = line.match(/__defMacro\(['"]([^'"]+)['"]/);
            if (match) {
                curMacroName = match[1];
                curMacroBody = '';
            } else {
                outLines.push(line);
            }
        }
        else if (line === ')') {
            macros[curMacroName] = curMacroBody;
            curMacroName = null;
        }
        else {
            curMacroBody += line;
        }
    });

    code = outLines.join('\n');

    for (let k in macros) {
        while (code.indexOf(k) >= 0) {
            code = code.replace(k, macros[k]);
        }
    }

    return code;
};

const getMinifiedShader = path => {
    const SHADER_MIN_TOOL = process.platform === 'win32' ? 'tools\\shader_minifier.exe' : 'mono tools/shader_minifier.exe';
    shell.exec(`${SHADER_MIN_TOOL} --preserve-externals --no-renaming-list main --format none ${path} -o tmp_out.glsl`);
    return fs.readFileSync('tmp_out.glsl', 'utf8');
}

const insertShaders = js => {
    while (js.indexOf('__shader(') >= 0) {
        const match = js.match(/__shader\(['"]([^'"]+)['"]\)/);
        let shader = getMinifiedShader(SRC_DIR + '/' + match[1]);

        if (match[1].endsWith('frag')) {
            shader = FRAG_PREFIX + shader;
        }

        js = js.replace(/__shader\(['"][^'"]+['"]\)/, "'"+shader+"'");
    }
    
    return js;
};

const removeWhitespace = js => js
    .replace(/[ \t\r\n]+/g, '')
    .replace(/return/g, 'return ')
    .replace(/newDate/g, 'new Date');

const afterPackingTransform = js => {
    js = js.trim();
    js = js.replace(/g\./g, '');
    return js;
};

const main = () => {
    let js = fs.readFileSync(SRC_DIR + '/main.js', 'utf8');

    js = stripComments(js);
    js = replaceMacros(js);
    js = removeWhitespace(js);
    js = insertShaders(js);
    js = minifyPrefixedIdentifiers('\\$', js);
    js = minifyPrefixedIdentifiers('x_', js);

    fs.writeFileSync('tmp_in.js', js);

    console.log('Initial packing step:');
    shell.exec('regpack --contextType 1 --hashWebGLContext true --contextVariableName g --varsNotReassigned g,a tmp_in.js > tmp_out.js');
    console.log('');

    let packedJS = fs.readFileSync('tmp_out.js', 'utf8');

    fs.writeFileSync('tmp_in.js', packedJS.replace('eval(_)', 'console.log(_)'));
    shell.exec('node tmp_in.js > tmp_out.js');

    const unpackedJS = fs.readFileSync('tmp_out.js', 'utf8');

    if (DO_SECOND_PASS) {
        packedJS = afterPackingTransform(unpackedJS);
        fs.writeFileSync('tmp_in.js', packedJS);

        console.log(packedJS);
        console.log('');

        console.log('Second packing step:');
        shell.exec('regpack --varsNotReassigned g,a tmp_in.js > tmp_out.js');
        console.log('');

        packedJS = fs.readFileSync('tmp_out.js', 'utf8');
    } else {
        console.log(unpackedJS);
        console.log('');
    }

    const shimHTML = fs.readFileSync(SRC_DIR + '/shim.html', 'utf8');

    fs.writeFileSync('index.html',
        shimHTML.replace(/__CODE__[^]*/,'')
        + packedJS
        + shimHTML.replace(/[^_]*__CODE__/,'')
    );

    shell.rm('-rf', 'tmp*.*');
}

main();