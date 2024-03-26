import * as fs from 'fs';
//import * as yargs from 'yargs';

const yargs = require('yargs');

// 行の型定義
interface Row {
  [key: string]: number | string;
}

// データモデルの型定義
interface Model {
  [key: string]: { type: string; example: number | string };
}

// コマンドライン引数の型定義
interface Args {
  model: string;
  start: number;
  end: number;
  output: string;
}

// JSONファイルからデータモデルを読み込む関数
function loadRowModel(modelFilePath: string): Model {
  const modelData = fs.readFileSync(modelFilePath, 'utf8');
  return JSON.parse(modelData);
}

// CSVデータを生成する関数
function generateCSVData(start: number, end: number, model: Model): Row[] {
  const data: Row[] = [];
  for (let i = start; i <= end; i++) {
    const row: Row = {};
    Object.keys(model).forEach(key => {
      const exampleValue = model[key].example;
      if (typeof exampleValue === 'number') {
        row[key] = exampleValue + i - 1;
      } else if (typeof exampleValue === 'string') {
        row[key] = exampleValue.replace(/\d+/g, match => (parseInt(match) + i - 1).toString());
      }
    });
    data.push(row);
  }
  return data;
}

// データをCSV形式に変換する関数
function convertToCSV(data: Row[]): string {
  const header = Object.keys(data[0]).join(',') + '\n';
  const body = data.map(row => Object.values(row).join(',')).join('\n');
  return header + body;
}

// CSVデータをファイルに保存する関数
function saveCSVToFile(data: string, fileName: string): void {
  fs.writeFileSync(fileName, data, 'utf8');
}

// コマンドライン引数の解析
const argv = yargs
  .option('model', {
    describe: 'データモデルのJSONファイルを指定します。',
    demandOption: true,
    type: 'string',
  })
  .option('start', {
    describe: '開始行の番号を指定します。',
    demandOption: true,
    type: 'number',
  })
  .option('end', {
    describe: '終了行の番号を指定します。',
    demandOption: true,
    type: 'number',
  })
  .option('output', {
    describe: '出力ファイル名を指定します。',
    demandOption: true,
    type: 'string',
  })
  .argv as Args; // yargs の型指定

// JSONファイルからデータモデルを読み込み
const rowModel: Model = loadRowModel(argv.model);

// 指定された範囲のCSVデータを生成してファイルに保存
const csvData: Row[] = generateCSVData(argv.start, argv.end, rowModel);
const csvString: string = convertToCSV(csvData);
saveCSVToFile(csvString, argv.output);

console.log(`成功: ${argv.start} 行から ${argv.end} 行までのCSVデータを ${argv.output} に保存しました。`);
