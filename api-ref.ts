import yargs from 'yargs';
import fs from 'fs';
import { exec } from 'child_process';

//定数
const COMMAND_OPTION_NAME: string = "name";
const COMMAND_OPTION_VERSION: string = "api-version";
const DIR_APIS: string = "apis/";
const FILE_NAME: string = "awsResources.json";

//子フォルダ情報取得
const getDirectories = (source: string): string[] =>
    fs.readdirSync(source, { withFileTypes: true })
        .filter((dirent: fs.Dirent) => dirent.isDirectory())
        .map((dirent: fs.Dirent) => dirent.name);

//API情報プレビュー
async function main() {
    //コマンドラインパラメータ
    const argv = yargs.version(false)
        .option(COMMAND_OPTION_NAME, {
            alias: "n",
            describe: "APIの名称を指定してください。",
            type: "string",
        })
        .option(COMMAND_OPTION_VERSION, {
            alias: "v",
            describe: "APIドキュメントのバージョンを指定してください。",
            type: "string",
        })
      .help()
      .parseSync()
    
    const name: string | undefined = argv[COMMAND_OPTION_NAME];
    const version: string | undefined = argv[COMMAND_OPTION_VERSION];
    
    try {
        //APIの名称あり
        if(typeof name !== "undefined") {
            if(!fs.existsSync(`${DIR_APIS}${name}`)) {
                throw 'APIの名称が正しくありません。';
            }
            
            //APIドキュメントのバージョンあり
            if(typeof version !== "undefined") {
                if(!fs.existsSync(`${DIR_APIS}${name}/${version}`)) {
                    throw 'APIドキュメントのバージョンが正しくありません。';
                }
                const fileName: string = `./${DIR_APIS}${name}/${version}/${FILE_NAME}`;
                const text: string = fs.readFileSync(fileName, "utf-8");
                console.log(text);
            //APIドキュメントのバージョンなし
            } else {
                const apiPath: string = `./${DIR_APIS}${name}/`;
                const allVersionPath: string[] = getDirectories(apiPath);
                
                for (let apiVersion of allVersionPath) {
                    const fileName: string = `./${DIR_APIS}${name}/${apiVersion}/${FILE_NAME}`;
                    const text: string = fs.readFileSync(fileName, "utf-8");
                    console.log(text);
                }
            }
        //APIの名称なし
        } else {
            //APIドキュメントのバージョンあり
            if(typeof version !== "undefined") {
                const parentPath: string = `./${DIR_APIS}/`;
                const allApiName: string[] = getDirectories(parentPath);
        
                for (let apiName of allApiName) {
                    const apiPath: string = `./${DIR_APIS}${apiName}/`;
                    const fileName: string = `./${DIR_APIS}${apiName}/${version}/${FILE_NAME}`;
                    try {
                        const text: string = fs.readFileSync(fileName, "utf-8");
                        console.log(text);
                    } catch(e) {
                        console.log("Info:", `${name}の${version}がありません。`);
                    }
                }
            //APIドキュメントのバージョンなし
            } else {
                const parentPath: string = `./${DIR_APIS}/`;
                const allApiName: string[] = getDirectories(parentPath);
        
                for (let apiName of allApiName) {
                    const apiPath: string = `./${DIR_APIS}${apiName}/`;
                    const allVersionPath: string[] = getDirectories(apiPath);
                    
                    for (let apiVersion of allVersionPath) {
                        const fileName: string = `./${DIR_APIS}${apiName}/${apiVersion}/${FILE_NAME}`;
                        const text: string = fs.readFileSync(fileName, "utf-8");
                        console.log(text);
                    }
                }
            }
        }
    } catch (e) {
        //console.log("Error:", e);
    }
}

//主処理
main();
