import { execSync } from 'child_process';
import yargs from 'yargs';
import fs from "fs";

const COMMAND_OPTION_NAME: string = "name";
const COMMAND_OPTION_VERSION: string = "api-version";
const DIR_APIS: string = "apis/";
const DIR_CDK: string = "cdk/";

function createCdkDestroyCommand(name: string, version: string): string {
    return `cd ${DIR_APIS}${name}/${version}/${DIR_CDK} && 
    cdk destroy --all --force && 
    cd ../../../../`;
}

// API削除
async function main() {
    // APIの名称、APIドキュメントのバージョンを取得
    const argv = yargs.version(false)
        .option(COMMAND_OPTION_NAME, {
            alias: "n",
            describe: "APIの名称を指定してください。",
            demandOption: true, // 必須の引数とする
            type: "string",
        })
        .option(COMMAND_OPTION_VERSION, {
            alias: "v",
            describe: "APIドキュメントのバージョンを指定してください。",
            demandOption: true, // 必須の引数とする
            type: "string",
        })
        .help()
        .parseSync()
    
    const name = argv[COMMAND_OPTION_NAME];
    const version = argv[COMMAND_OPTION_VERSION];

    try {
        if(!fs.existsSync(`${DIR_APIS}${name}`)) {
            console.log(fs.existsSync(`${DIR_APIS}${name}`));
            throw 'APIの名称が正しくありません。';
        } else if(!fs.existsSync(`${DIR_APIS}${name}/${version}`)) {
            throw 'APIドキュメントのバージョンが正しくありません。';
        }
        
        const execCommand: string = createCdkDestroyCommand(name, version);
    
        execSync(execCommand);
    } catch (e) {
        console.log('Error:', e);
    }
}

// API削除を呼び出す
main();
