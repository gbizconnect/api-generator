import * as YAML from "yaml";
import * as Mustache from "mustache";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, copyFileSync } from "fs";
import * as path from "path";
import { execSync } from "child_process";

import { DynamoDBClient, DescribeTableCommand/*, DescribeTableCommandOutput*/ } from "@aws-sdk/client-dynamodb";
import { LambdaClient, GetFunctionCommand, GetFunctionCommandOutput } from "@aws-sdk/client-lambda";
import { APIGatewayClient, GetRestApisCommand } from "@aws-sdk/client-api-gateway";
//import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

import * as CONSTANTS from './constants';

//既存の console.log()をOverriderする
// info = 青字 | debug = デフォルト | warn = 黄色 | error = 赤字| log = デフォルト
console.info = function(message:string) {
    const date_now = new Date().toString();
    const date_string = date_now.substring(0,33);
    console.log('\x1b[34m%s\x1b[0m', date_string + " [INFO]: " + message
    );
};

console.warn= function(message:string) {
    const date_now = new Date().toString();
    const date_string = date_now.substring(0,33);
    console.log('\x1b[33m%s\x1b[0m', date_string + " [WARN]: " + message
    );
};

console.error= function(message:string) {
    const date_now = new Date().toString();
    const date_string = date_now.substring(0,33);
    console.log('\x1b[31m%s\x1b[0m', date_string + " [ERROR]: " + message
    );
};

const CONFIG = {region: CONSTANTS.AWS_REGION,}

const yargs = require('yargs');

function displayUsage() {
    yargs.showHelp();
}

// cを使用してコマンドライン引数を設定
const args = require("yargs")
    .option(CONSTANTS.COMMAND_OPTION_AWS_REGION, {
        alias: "a",
        describe: "APIを構築するAWSのリージョンを設定してください。",
        default: CONSTANTS.AWS_REGION, 
        type: "string",
    })
    .option(CONSTANTS.COMMAND_OPTION_NAME, {
        alias: "n",
        describe: "APIの名称を半角英数字記号(-) 30文字以内で入力してください。",
        demandOption: true,
        type: "string",
    })
    .option(CONSTANTS.COMMAND_OPTION_MODEL, {
        alias: "m",
        describe: "モデルファイルを指定してください。",
        demandOption: true,
        type: "string",
    })
    .option(CONSTANTS.COMMAND_OPTION_API_VERSION, {
        alias: "v",
        describe: "APIのバージョンを半角数字記号(.) 10文字以内で入力してください。",
        demandOption: true,
        type: "string",
    })
    .option(CONSTANTS.COMMAND_OPTION_AUTH_UPDATE, {
        alias: "u",
        describe: "更新系APIにBasic認証をかける場合、設定してください。",
        type: "boolean",
    })
    .option(CONSTANTS.COMMAND_OPTION_AUTH_REF, {
        alias: "r",
        describe: "参照系APIにBasic認証をかける場合、設定してください。",
        type: "boolean",
    })
    .option(CONSTANTS.COMMAND_OPTION_ID, {
        alias: "i",
        describe: "更新系APIもしくは参照系APIにBasic認証をかける場合、Basic認証のIDを半角英数字記号(.@-_) 8文字以上で入力してください。",
        type: "string",
    })
    .option(CONSTANTS.COMMAND_OPTION_PASSWORD, {
        alias: "p",
        describe: "更新系APIもしくは参照系APIにBasic認証をかける場合、Basic認証のパスワードを半角英大文字、半角英小文字、半角数字、記号(.@-_*#$%=+:;!)を含む10文字以上16文字以内で入力してください。",
        type: "string",
    })
    .option(CONSTANTS.COMMAND_OPTION_CHECK, {
        alias: "c",
        describe: "モデルファイルやid,passwordなどのチェックのみを行います。AWSにREST APIを構築しません。",
        type: "boolean",
    })
    .option(CONSTANTS.COMMAND_OPTION_CONTACT, {
        describe: "コンタクト情報(サポートページのURLやメールアドレス)を100文字以内で入力してください。Swagger-UIに出力されます。",
        type: "string",
    })
    .option(CONSTANTS.COMMAND_OPTION_TERM, {
        describe: "APIの利用規約(Terms Of Service)URL形式で100文字以内で入力してください。Swagger-UIに出力されます。",
        type: "string",
    })
    .option(CONSTANTS.COMMAND_OPTION_OWNER, {
        describe: "APIのOwnerを100文字以内で入力してください。Swagger-UIに出力されます。",
        type: "string",
    })
    .option(CONSTANTS.COMMAND_OPTION_COST_SECTION, {
        describe: "費用負担部門を100文字以内で入力してください。Swagger-UIに出力されます。",
        type: "string",
    })
    .option(CONSTANTS.COMMAND_OPTION_LICENSE, {
        describe: "ライセンス情報を100文字以内で入力してください。ライセンスページのURLも記述可能です。Swagger-UIに出力されます。",
        type: "string",
    })
    .option(CONSTANTS.COMMAND_OPTION_IMPORT_FOLDER, {
        alias: "f",
        describe: "初期インポートファイルを配置するフォルダを設定してください。",
        type: "string",
    })
    .help("help",
        "ヘルプを表示します。")
    .version("version",
        "ツールのバージョンを表示します。",
        CONSTANTS.COMMAND_OPTION_CURR_VERSION  
    )
    .wrap(null)
    .parseSync()
    ;


class InvalidModelError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "InvalidModelError";
    }
}

class SameVersionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "SameVersionError";
    }
}

class AwsResourceNotFoundError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "AwsResourceNotFoundError";
    }
}


interface property {
    name: string,
    type: string,
    example: any,
    properties: property[],
}

main();

/**
 * main.
 */
async function main() {
    
    console.info("start generating api.");
    console.info("\n" +
            "Name:           " + args[CONSTANTS.COMMAND_OPTION_NAME] +          "\n" +
            "Api Version:    " + args[CONSTANTS.COMMAND_OPTION_API_VERSION] +   "\n" +
            "Contact:        " + args[CONSTANTS.COMMAND_OPTION_CONTACT] +       "\n" +
            "License:        " + args[CONSTANTS.COMMAND_OPTION_LICENSE] +       "\n" +
            "Terms:          " + args[CONSTANTS.COMMAND_OPTION_TERM] +          "\n" +
            "Cost Section:   " + args[CONSTANTS.COMMAND_OPTION_COST_SECTION] +  "\n" + 
            "Owner:          " + args[CONSTANTS.COMMAND_OPTION_OWNER]
    );

    // region設定
    if(args.a) {
        CONFIG.region = args[CONSTANTS.COMMAND_OPTION_AWS_REGION];
        console.info("AWS Region: " + CONFIG.region);
    }
    
    //コマンドライン引数
    const apiName = args[CONSTANTS.COMMAND_OPTION_NAME];
    const modelFileName = args[CONSTANTS.COMMAND_OPTION_MODEL];
    const apiVersion = args[CONSTANTS.COMMAND_OPTION_API_VERSION];
    const isAuthUpdate = !(args[CONSTANTS.COMMAND_OPTION_AUTH_UPDATE] === undefined);
    const isAuthRef = !(args[CONSTANTS.COMMAND_OPTION_AUTH_REF] === undefined);
    const id = args[CONSTANTS.COMMAND_OPTION_ID];
    const password = args[CONSTANTS.COMMAND_OPTION_PASSWORD];
    const importFolder = args[CONSTANTS.COMMAND_OPTION_IMPORT_FOLDER];

    let jsonDataForTemplate:object = {};
    

    // コマンドライン引数のチェック
    try {
        const argsHasErrors = checkArgs();
        if(argsHasErrors == true) {
            console.error("An error has occurred. See help.");
            displayUsage();
            process.exit(1);
        } else {
            console.info("Finish check command line params. No error occurred.");
        }
        
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
    
    // モデルファイルの解析とOpenAPI Specファイル生成処理
    try {
        //ディレクトリ作成とmodelのコピー
        makeDirAndCopyModel(apiName, modelFileName, apiVersion);
        
        //テンプレートに埋め込むjsonを生成する
        jsonDataForTemplate = createJsonDataForTemplate(apiName, id, password, isAuthUpdate, isAuthRef, apiVersion, importFolder);
        
        //openAPIspecファイル出力
        outputOpenapiYaml(apiName, apiVersion, jsonDataForTemplate);

    } catch(e) {
        
        if(e instanceof InvalidModelError) {
            console.error(e.message);
        } else {
            console.error(e);
        }
        process.exit(1);
    }
    
    // check処理の場合は処理終了
    if(args.c) {
        console.info("チェック処理が完了しました。エラーはありません。");
        process.exit(0);
    }
    
    // CKD APP構築処理
    try {
        //swagger-uiディレクトリのコピー
        copySwaggerUiDirectory(apiName, apiVersion);
        
        //CDKプログラムの作成
        createCdkStack(apiName, apiVersion, jsonDataForTemplate, isAuthUpdate, isAuthRef);
        if(typeof importFolder !== "undefined") {
            //s3バケットのデプロイ
            deployS3BucketCsvStack(apiName, apiVersion);
        }
        
        //APIGatewayスタックのデプロイ
        deployApigatewayStack(apiName, apiVersion);
        
        //構築したAPIGatewayのurlをswagger-ui/dist/openapi.yamlに記入する
        await editOpenapiSpec(apiName, apiVersion);
        
        //s3バケットのデプロイ
        deployS3BucketStack(apiName, apiVersion);
        
        //AWSリソース情報を出力
        await getAwsResources(apiName, apiVersion, isAuthUpdate, isAuthRef);
        
        //テストファイル出力
        await makeTest(apiName, apiVersion, jsonDataForTemplate);
        
    } catch(e) {
        if(e instanceof AwsResourceNotFoundError
            || e instanceof SameVersionError
        ) {
            console.error(e.message);
        } else {
            console.error(e);
        }
        process.exit(1);
    }
    
    console.info("finish generating api.");
    process.exit(0);
}


/**
 * コマンドライン引数をチェックする.
 * 
 * @returns {boolean} true: エラーが存在する場合, false: エラーが無い場合
 */
function checkArgs() :boolean {
    
    let hasError = false;
    
    //コマンドライン引数
    const apiName = args[CONSTANTS.COMMAND_OPTION_NAME];
    const modelFileName = args[CONSTANTS.COMMAND_OPTION_MODEL];
    const apiVersion = args[CONSTANTS.COMMAND_OPTION_API_VERSION];
    const isAuthUpdate = !(args[CONSTANTS.COMMAND_OPTION_AUTH_UPDATE] === undefined);
    const isAuthRef = !(args[CONSTANTS.COMMAND_OPTION_AUTH_REF] === undefined);
    const id = args[CONSTANTS.COMMAND_OPTION_ID];
    const password = args[CONSTANTS.COMMAND_OPTION_PASSWORD];
    const importFolder = args[CONSTANTS.COMMAND_OPTION_IMPORT_FOLDER];
    const contact = args[CONSTANTS.COMMAND_OPTION_CONTACT];
    const license = args[CONSTANTS.COMMAND_OPTION_LICENSE];
    const terms = args[CONSTANTS.COMMAND_OPTION_TERM];
    const costSection = args[CONSTANTS.COMMAND_OPTION_COST_SECTION];
    const owner =  args[CONSTANTS.COMMAND_OPTION_OWNER];
    
    console.info("Start check command line params for " + apiName + " " + apiVersion);

    hasError = checkName(apiName);
    hasError = checkApiVersion(apiVersion) || hasError;
    hasError = checkModelFileName(modelFileName) || hasError;
    hasError = checkAuth(id, password, isAuthUpdate, isAuthRef) || hasError;
    hasError = checkImportFolder(importFolder) || hasError;
    hasError = checkContact(contact) || hasError;
    hasError = checkLicense(license) || hasError;
    hasError = checkTerms(terms) || hasError;
    hasError = checkCostSection(costSection) || hasError;
    hasError = checkOwner(owner) || hasError;

    return hasError;
}


function checkName(name: string) :boolean {
    
    // Stack name must match the regular expression: /^[A-Za-z][A-Za-z0-9-]*$/
    let hasError  = false;
    hasError = checkMaxLength(CONSTANTS.COMMAND_OPTION_NAME, name, 30);
    hasError = checkRegex(CONSTANTS.COMMAND_OPTION_NAME, name, /^[A-Za-z][A-Za-z0-9\-]*$/, "半角英数字記号(-)") || hasError;
    return hasError;
}


function checkApiVersion(apiVersion: string) :boolean {
    
    let hasError  = false;
    hasError = checkMaxLength(CONSTANTS.COMMAND_OPTION_API_VERSION, apiVersion, 10);
    hasError = checkRegex(CONSTANTS.COMMAND_OPTION_API_VERSION, apiVersion, /^[0-9][0-9\.]*$/, "半角数字記号(.)") || hasError;
    
    //s3バケットのsuffixのチェック
    const ngSuffix1 = "-s3alias";
    const ngSuffix2 = "--ol-s3";
    
    hasError = checkSuffix(CONSTANTS.COMMAND_OPTION_API_VERSION, apiVersion, ngSuffix1) || hasError;
    hasError = checkSuffix(CONSTANTS.COMMAND_OPTION_API_VERSION, apiVersion, ngSuffix2) || hasError;
    
    return hasError;
}


function checkModelFileName(modelFileName :string) :boolean {
    let hasError  = false;
    
    if(!existsSync(modelFileName)) {
        console.error(`${modelFileName}が存在しません。${CONSTANTS.COMMAND_OPTION_MODEL}には存在するファイル指定してください。`);
        hasError = true;
    }
    return hasError;
}


function checkId(id: string) :boolean {

    let hasError  = false;
    
    hasError = checkNotUndefined(CONSTANTS.COMMAND_OPTION_ID, id);
    if(hasError) {
        return hasError;
    }
    hasError = checkStrPeriod(CONSTANTS.COMMAND_OPTION_ID, id, 8, 100) || hasError;
    hasError = checkRegex(CONSTANTS.COMMAND_OPTION_ID, id, /^[A-Za-z0-9\-_@\.]+$/, "半角英数字記号(.@-_)") || hasError;
    return hasError;
}


function checkPassword(password: string) :boolean {
    
    let hasError  = false;
    hasError = checkNotUndefined(CONSTANTS.COMMAND_OPTION_PASSWORD, password);
    if(hasError) {
        return hasError;
    }
    hasError = checkStrPeriod(CONSTANTS.COMMAND_OPTION_PASSWORD, password, 10, 16) || hasError;
    hasError = checkPasswordComplexity(password) || hasError;
    return hasError;
}

function checkPasswordComplexity(password: string): boolean {
    
    let hasError  = false;
    
    const lowercaseRegex = /[a-z]/;
    const uppercaseRegex = /[A-Z]/;
    const digitRegex = /[0-9]/;
    const specialCharactersRegex = /[.@\-_*#$%=+:;!]/;

    const hasLowercase = lowercaseRegex.test(password);
    const hasUppercase = uppercaseRegex.test(password);
    const hasDigit = digitRegex.test(password);
    const hasSpecialCharacter = specialCharactersRegex.test(password);

    hasError = !(hasLowercase && hasUppercase && hasDigit && hasSpecialCharacter);
    
    if (hasError) {
        console.error(`passwordは半角英大文字、半角英小文字、半角数字、記号(.@-_*#$%=+:;!)を最低1文字使用してください。`);
    }
    
    return hasError;
}

function checkAuth(id: any, password: any, isAuthUpdate: boolean, isAuthRef: boolean) :boolean {
    
    console.info("認証設定をチェックします。(auth-update, auth-ref, id, password)");
    
    let hasError  = false;
    
    // 認証を行わない場合 id, passwordのチェックは不要
    if(!isAuthUpdate && !isAuthRef) {
        console.info("認証は設定されていません。");
        return hasError;// false
    }

    // id, passwordの入力値チェック。必須 & 正規表現チェック
    hasError = checkId(id) || hasError;
    hasError = checkPassword(password) || hasError;

    return hasError;
}


function checkImportFolder(importFolder: string) :boolean {
    let hasError  = false;
    
    if(typeof importFolder == "undefined") {
        return hasError;
    }
    
    const importFolderPath = importFolder;
    if(!existsSync(importFolderPath)) {
        console.error(`${importFolder}が存在しません。${CONSTANTS.COMMAND_OPTION_IMPORT_FOLDER}には存在するファイル指定してください。`);
        hasError = true;
    }
    return hasError;
}


function checkContact(contact: string) :boolean {
    if(typeof contact == "undefined") {
        return false;
    }
    return checkMaxLength(CONSTANTS.COMMAND_OPTION_CONTACT, contact, 100);
}


function checkLicense(license: string) :boolean {
    if(typeof license == "undefined") {
        return false;
    }
    return checkMaxLength(CONSTANTS.COMMAND_OPTION_LICENSE, license, 100);
}


function checkTerms(terms: string) :boolean {
    if(typeof terms == "undefined") {
        return false;
    }
    return checkMaxLength(CONSTANTS.COMMAND_OPTION_TERM, terms, 100);
}


function checkCostSection(costSection: string) :boolean {
    if(typeof costSection == "undefined") {
        return false;
    }
    return checkMaxLength(CONSTANTS.COMMAND_OPTION_COST_SECTION, costSection, 100);
}


function checkOwner(owner: string) :boolean {
    if(typeof owner == "undefined") {
        return false;
    }
    return checkMaxLength(CONSTANTS.COMMAND_OPTION_OWNER, owner, 100);
}


// 必須チェック
function checkNotUndefined(key :string, value :string) :boolean {
    let hasError  = false;
    if(!value) {
        console.error(`${key}を入力してください。`);
        hasError = true;
    }
    return hasError;
}

// 最大文字数チェック
function checkMaxLength(key :string, value :string, max :number) :boolean {
    
    let hasError  = false;
    if(max < value.length) {
        hasError = true;
        console.error(`${key}は${max}文字以内で入力してください。`);
    }
    return hasError;
}

function checkStrPeriod(key :string, value :string, min :number, max :number) :boolean {
    
    let hasError  = false;
    if(min > value.length || max < value.length) {
        hasError = true;
        console.error(`${key}は${min}文字以上、${max}文字以内で入力してください。`);
    }
    return hasError;
}

// 正規表現チェック
function checkRegex(key :string, value :string, regex :RegExp, rule: string) :boolean {
    let hasError  = false;
    
    if (!regex.test(value)) {
        hasError = true;
        console.error(`${key}は${rule}で入力してください。`);
    }
    return hasError;
}

function checkSuffix(key :string, value :string, ngSuffix: string) :boolean {
    let hasError  = false;
    if(value.endsWith(ngSuffix)) {
        hasError = true;
        console.error(`${key}の末尾に${ngSuffix}は使用できません。`);
    }
    return hasError;
}


function convertName(apiVersionBeforeConvert: string) {
    return apiVersionBeforeConvert.replace(/\./g, '-');
}


//ディレクトリ作成とモデルファイルの出力
function makeDirAndCopyModel(apiName: string, modelFileName: string, apiVersion: string) {
    
    console.info("Start creating model files for " + apiName + " " + apiVersion);
    
    const apiDir = CONSTANTS.DIR_APIS + apiName + "/";
    mkdirSync(apiDir, { recursive: true });
    
    //拡張子のチェック
    const modelFileExt = path.extname(modelFileName);
    if(!(modelFileExt === CONSTANTS.YAML_FILE_EXT || modelFileExt === CONSTANTS.YML_FILE_EXT)){
        const message = "yaml(またはyml)以外の拡張子が指定されています。";
        throw new InvalidModelError(message);
    }
    
    //ファイルの存在チェック
    const modelFilePath = modelFileName;
    //if(!existsSync(modelFilePath)) {
    //    const message = modelFilePath + "が存在しません";
    //    throw new FileNotFoundError(message);
    //}

    //指定されたモデルファイルの読み込み
    const model = readFileSync(modelFilePath, CONSTANTS.CHARACTER_CODE_UTF8);
    const parsedModel = YAML.parse(model);
    
    //過去のバージョンの読み込み
    const pastVersions = readdirSync(apiDir, { withFileTypes: true }).filter(dirent => dirent.isDirectory()).map(dirent => dirent.name);
    console.log(pastVersions);
    
    //過去バージョンのモデルと一致しているかのチェック
    for(const pastVersion of pastVersions) {
        const cdkDir = CONSTANTS.DIR_APIS + apiName + "/" + pastVersion + "/" + CONSTANTS.DIR_CDK;
        if(apiVersion === pastVersion && existsSync(cdkDir)) {
            const message = "バージョン「" + pastVersion + "」は既に存在しデプロイ済みです。";
            throw new SameVersionError(message);
        }
        const pastVersionDir = apiDir + pastVersion + "/";
        const pastVersionModelFilePath = pastVersionDir + CONSTANTS.FILE_MODEL;
        const pastVersionModel = readFileSync(pastVersionModelFilePath, CONSTANTS.CHARACTER_CODE_UTF8);
        const parsedPastVersionModel = YAML.parse(pastVersionModel);

        if(JSON.stringify(parsedPastVersionModel) === JSON.stringify(parsedModel)) {
            const message = "指定されたモデルは、バージョン「" + pastVersion + "」のモデルと一致しています。";
            console.warn(message);
        }
    }
    
    //新しいバージョンのディレクトリ作成、モデルのコピー
    const version = apiVersion;
    const versionDir = apiDir + version + "/";
    mkdirSync(versionDir, { recursive: true });
    const outputModelFilePath = versionDir + CONSTANTS.FILE_MODEL;
    writeFileSync(outputModelFilePath, model,CONSTANTS.CHARACTER_CODE_UTF8);
    
    console.info("Successfully cteated model files for " + apiName + " " + apiVersion + "\n");
}


//データモデルのyamlファイルからテンプレートに埋め込むjsonデータを取得する
function createJsonDataForTemplate(apiName: string, id: any, password: any, isAuthUpdate: boolean, isAuthRef: boolean, apiVersion: string, importFolder: string) {
    
    console.info("Start creating JSON template from YAML for" + apiName + " " + apiVersion);
    
    //データモデルのyamlファイルの読み込み
    const modelFilePath = CONSTANTS.DIR_APIS + apiName + "/" + apiVersion + "/" + CONSTANTS.FILE_MODEL;
    
    //ファイルの読み込み
    const model = readFileSync(modelFilePath, CONSTANTS.CHARACTER_CODE_UTF8);
    
    //データのパース
    const parsedModelYaml = YAML.parse(model);
    
    if(!parsedModelYaml) {
        const message = "モデルファイルが空です。";
        throw new InvalidModelError(message);
    }
    
    if(!parsedModelYaml.components) {
        const message = "モデルファイルにcomponentsが含まれまていません。";
        throw new InvalidModelError(message);
    }
    if(!parsedModelYaml.components.schemas) {
        const message = "モデルファイルにschemasが含まれていません。";
        throw new InvalidModelError(message);
    }
    
    //スキーマの取得
    const schemaNames = Object.keys(parsedModelYaml.components.schemas);
    
    //キーの取得
    if(!parsedModelYaml.components.schemas[schemaNames[0]].keys) {
        const message = "モデルファイルにkeysが含まれていません。";
        throw new InvalidModelError(message);
    } else if(!parsedModelYaml.components.schemas[schemaNames[0]].keys.partition_key) {
        const message = "モデルファイルにpartition_keyが含まれていません。";
        throw new InvalidModelError(message);
    } else if(!parsedModelYaml.components.schemas[schemaNames[0]].keys.partition_key.name) {
        const message = "モデルファイルにpartition_key.nameが含まれていません。";
        throw new InvalidModelError(message);
    }
    const partitionKeyName = parsedModelYaml.components.schemas[schemaNames[0]].keys.partition_key.name;
    let isExistSortKey = false;
    if(parsedModelYaml.components.schemas[schemaNames[0]].keys.sort_key) {
        isExistSortKey = true;
    }
    const sortKeyName = parsedModelYaml.components.schemas[schemaNames[0]].keys.sort_key?.name;
    
    //jsonに変換する
    if(!parsedModelYaml.components.schemas[schemaNames[0]].properties) {
        const message = "モデルファイルにpropertiesが含まれていません。";
        throw new InvalidModelError(message);
    }
    
    const properties = parsedModelYaml.components.schemas[schemaNames[0]].properties;
    const propertiesInfoJson: any[] = [];
    let isExistPartitionKeyInProp = false;
    let isExistSortKeyInProp = false;
    let pkAttributeType:　string = "";
    let pkInfoJson = {};
    let skInfoJson = {};
    let checkProgram = "";

    for (const property of properties) {
        //モデルのフォーマットチェック
        if(!property.name){
            const message = "モデルファイルにnameが含まれていません。";
            throw new InvalidModelError(message);
        }else if(!property.type){
            const message = "モデルファイルにtypeが含まれていません。";
            throw new InvalidModelError(message);
        }
        
        //パーティションキーもしくはソートキーならtrue
        let isPrimaryKey = false;
        
        //パーティションキーの処理
        if(partitionKeyName === property.name) {
            isPrimaryKey = true;
            isExistPartitionKeyInProp = true;
            let isString = false;
            if(CONSTANTS.PROPERTY_TYPE_STRING === property.type) {
                pkAttributeType = "STRING";
                isString = true;
            } else if(CONSTANTS.PROPERTY_TYPE_INTEGER === property.type) {
                pkAttributeType = "NUMBER";
                isString = false;
            } else {
                const message = "適切なpartition keyを選択していません。";
                throw new InvalidModelError(message);
            }
            //テンプレート用のjson
            pkInfoJson = {
                property: property.name,
                type: property.type,
                isString: isString,
            }
        }
        
        //ソートキーの処理
        if(isExistSortKey && sortKeyName === property.name) {
            isPrimaryKey = true;
            isExistSortKeyInProp = true;
            let isString = false;
            if(CONSTANTS.PROPERTY_TYPE_STRING === property.type) {
                pkAttributeType = "STRING";
                isString = true;
            } else if(CONSTANTS.PROPERTY_TYPE_INTEGER === property.type) {
                pkAttributeType = "NUMBER";
                isString = false;
            }
            
            //テンプレート用のjson
            skInfoJson = {
                property: property.name,
                type: property.type,
                isString: isString,
            }
        }
        
        //exampleの設定
        let isString = false;
        if(CONSTANTS.PROPERTY_TYPE_STRING === property.type) {
            isString = true;
        }
        let stringExample = "string_value";
        let integerExample = 123;
        if(property.example) {
            if(isString) {
                stringExample = property.example;
            } else {
                integerExample = property.example;
            }
        }
        
        if(CONSTANTS.PROPERTY_TYPE_OBJECT === property.type) {
            checkProgram += makeCheckRequestBody(property);
        }
        
        //テンプレート用のjsonオブジェクト
        const propertyInfoJson = {
            "property_name": property.name,
            "type": property.type,
            "example": isString ? stringExample : integerExample,
            "isString": isString,
            "isPrimaryKey": isPrimaryKey,
        };
        propertiesInfoJson.push(propertyInfoJson);
    }
    
    //propetiesにpartitionkeyが存在しない場合
    if(!isExistPartitionKeyInProp) {
        const message = "propertiesにpartition_keyで指定したプロパティがありません";
        throw new InvalidModelError(message);
    } else if(isExistSortKey && !isExistSortKeyInProp) {
        const message = "propertiesにsort_keyで指定したプロパティがありません";
        throw new InvalidModelError(message);
    }
    
    //認証関連isAuthUpdate, isAuthRef
    const isAuth = isAuthUpdate || isAuthRef;
    
    //セカンダリインデックスチェックとタイプの設定
    const globalSecondarys = [];
    const globalSecondaryKeys = parsedModelYaml.components.schemas[schemaNames[0]].keys.secondary_keys?.global_secondary_keys;
    
    if(globalSecondaryKeys) {
        for(const key of globalSecondaryKeys) {
            let partitionkey = "";
            let sortkey = "";
            let partitionkeyType = "dynamodb.AttributeType.STRING";
            let sortkeyType = "dynamodb.AttributeType.STRING";
            
            for (const property of properties) {
                if(CONSTANTS.PROPERTY_TYPE_STRING !== property.type && CONSTANTS.PROPERTY_TYPE_INTEGER !== property.type) {
                    continue;
                }
                
                if(!partitionkey && property.name === key.partition_key) {
                    partitionkey = key.partition_key;
    
                    if(CONSTANTS.PROPERTY_TYPE_STRING !== property.type) {
                        partitionkeyType = "dynamodb.AttributeType.NUMBER";
                    }
                }

                if(!sortkey && property.name === key.sort_key) {
                    sortkey = key.sort_key;
    
                    if(CONSTANTS.PROPERTY_TYPE_STRING !== property.type) {
                        sortkeyType = "dynamodb.AttributeType.NUMBER";
                    }
                }
                
                if(partitionkey && sortkey) {
                    globalSecondarys.push({
                        index_name: key.index_name,
                        partition_key: key.partition_key,
                        partition_key_type: partitionkeyType,
                        sort_key: key.sort_key,
                        sort_key_type: sortkeyType,
                    });
                    break;
                } else if(partitionkey) {
                    globalSecondarys.push({
                        index_name: key.index_name,
                        partition_key: key.partition_key,
                        partition_key_type: partitionkeyType,
                    });
                    break;
                }
            }
            
            if(!partitionkey) {
                const message = "グローバルセカンダリインデックスのソートキーは、テーブルの非キー属性に含まれていません。";
                throw new InvalidModelError(message);
            }
        }
    }


    //セカンダリインデックスチェックとタイプの設定
    const localSecondarys = [];
    const localSecondaryKeys = parsedModelYaml.components.schemas[schemaNames[0]].keys.secondary_keys?.local_secondary_keys;
    
    if(localSecondaryKeys) {
        for(const key of localSecondaryKeys) {
            let sortkey = "";
            let sortkeyType = "dynamodb.AttributeType.STRING";
            
            for (const property of properties) {
                
                if(CONSTANTS.PROPERTY_TYPE_STRING !== property.type &&
                CONSTANTS.PROPERTY_TYPE_INTEGER !== property.type
                ) {
                    continue;
                }
                
                if(property.name === key.sort_key) {
                    sortkey = key.sort_key;
    
                    if(CONSTANTS.PROPERTY_TYPE_INTEGER == property.type) {
                        sortkeyType = "dynamodb.AttributeType.NUMBER";
                    }
                    
                    
                    localSecondarys.push({
                        index_name: key.index_name,
                        sort_key: key.sort_key,
                        sort_key_type: sortkeyType,
                    });
                    break;
                }
            }
            
            if(!sortkey) {
                const message = "ローカルセカンダリインデックスのソートキーは、テーブルの非キー属性に含まれていません。";
                throw new InvalidModelError(message);
            }
        }
    }

    const jsonDataForTemplate = {
        model: schemaNames[0],
        pk: pkInfoJson,
        isExistSortKey: isExistSortKey,
        sk: skInfoJson,
        properties: propertiesInfoJson,
        apiNameAndVersion: apiName + "-" + convertName(apiVersion),
        apiName: apiName,
        apiVersion: apiVersion,
        pkAttributeType: pkAttributeType,
        id: id,
        password: password,
        isAuthUpdate: isAuthUpdate,
        isAuthRef: isAuthRef,
        isAuth: isAuth,
        checkProgram: checkProgram,
        globalSecondarys: globalSecondarys,
        localSecondarys: localSecondarys,
        importFolder: importFolder,
    }
    
    console.info("Successfully created JSON template from YAML for " + apiName + " " + apiVersion + "\n");
    
    return jsonDataForTemplate;
}

//モデルのyamlファイルからMustache用のjsonフォーマットを作成する
function outputOpenapiYaml(apiName:string, apiVersion: string, jsonDataForTemplate: object) {
    //テンプレートからopenAPI定義ファイルを作成する
    const templateOpenapiFilePath = CONSTANTS.DIR_TEMPLATE + CONSTANTS.FILE_OPENAPI_TEMPLATE;
    const outputOpenapiSpecFilePath = CONSTANTS.DIR_APIS + apiName + "/" + apiVersion + "/" + CONSTANTS.FILE_OPENAPISPEC;
    outputFilesFromTemplate(templateOpenapiFilePath, outputOpenapiSpecFilePath, jsonDataForTemplate);
    
}

//swagger-uiディレクトリのコピー
function copySwaggerUiDirectory(apiName: string, apiVersion: string) {
    const dirSwaggerUiSource = CONSTANTS.DIR_SWAGGERUI;
    const dirSwaggerUiTarget = CONSTANTS.DIR_APIS + apiName + "/" + apiVersion + "/" + CONSTANTS.DIR_APIS_SWAFGGERUI;
    copyDirectory(dirSwaggerUiSource, dirSwaggerUiTarget);
}

//CDKプログラムを作成する
function createCdkStack(apiName: string, apiVersion: string, jsonDataForTemplate: object, isAuthUpdate: boolean, isAuthRef: boolean) {
    
    console.info("Start creating CdkStack for " + apiName + " " + apiVersion);
    
    //cdk initコマンドを実行する
    const dirCdk = CONSTANTS.DIR_APIS + apiName + "/" + apiVersion + "/" + CONSTANTS.DIR_CDK;
    mkdirSync(dirCdk, { recursive: true });
    const cdCommand = "cd " + dirCdk;
    const cdkInitCommand = "cdk init app --language=typescript";
    execSync(cdCommand + " && " + cdkInitCommand);
    
    //lambdaをテンプレートから作成する
    const dirLambda = dirCdk + CONSTANTS.DIR_LAMBDA;
    mkdirSync(dirLambda, { recursive: true });
    
    const templateRegisterFunctionPath = CONSTANTS.DIR_TEMPLATE + CONSTANTS.FILE_REGISTER_LAMBDA_TEMPLATE;
    const registerLambdaPath = dirCdk + CONSTANTS.DIR_LAMBDA + CONSTANTS.FILE_REGISTER_LAMBDA;
    outputFilesFromTemplate(templateRegisterFunctionPath, registerLambdaPath, jsonDataForTemplate);
    
    const templateGetRecordFunctionPath = CONSTANTS.DIR_TEMPLATE + CONSTANTS.FILE_GET_RECORD_LAMBDA_TEMPLATE;
    const getRecordLambdaPath = dirCdk + CONSTANTS.DIR_LAMBDA + CONSTANTS.FILE_GET_RECORD_LAMBDA;
    outputFilesFromTemplate(templateGetRecordFunctionPath, getRecordLambdaPath, jsonDataForTemplate);
    
    const templateSearchFunctionPath = CONSTANTS.DIR_TEMPLATE + CONSTANTS.FILE_SEARCH_LAMBDA_TEMPLATE;
    const searchLambdaPath = dirCdk + CONSTANTS.DIR_LAMBDA + CONSTANTS.FILE_SEARCH_LAMBDA;
    outputFilesFromTemplate(templateSearchFunctionPath, searchLambdaPath, jsonDataForTemplate);
    
    const templateDeleteAllFunctionPath = CONSTANTS.DIR_TEMPLATE + CONSTANTS.FILE_DELETE_ALL_LAMBDA_TEMPLATE;
    const deleteAllLambdaPath = dirCdk + CONSTANTS.DIR_LAMBDA + CONSTANTS.FILE_DELETE_ALL_LAMBDA;
    outputFilesFromTemplate(templateDeleteAllFunctionPath, deleteAllLambdaPath, jsonDataForTemplate);

    const templateDeleteRecordFunctionPath = CONSTANTS.DIR_TEMPLATE + CONSTANTS.FILE_DELETE_RECORD_LAMBDA_TEMPLATE;
    const deleteRecordLambdaPath = dirCdk + CONSTANTS.DIR_LAMBDA + CONSTANTS.FILE_DELETE_RECORD_LAMBDA;
    outputFilesFromTemplate(templateDeleteRecordFunctionPath, deleteRecordLambdaPath, jsonDataForTemplate);
    
    const templateUpdateRecordFunctionPath = CONSTANTS.DIR_TEMPLATE + CONSTANTS.FILE_UPDATE_RECORD_LAMBDA_TEMPLATE;
    const updateRecordLambdaPath = dirCdk + CONSTANTS.DIR_LAMBDA + CONSTANTS.FILE_UPDATE_RECORD_LAMBDA;
    outputFilesFromTemplate(templateUpdateRecordFunctionPath, updateRecordLambdaPath, jsonDataForTemplate);

    const templateUpdateRecordsFunctionPath = CONSTANTS.DIR_TEMPLATE + CONSTANTS.FILE_UPDATE_RECORDS_LAMBDA_TEMPLATE;
    const updateRecordsLambdaPath = dirCdk + CONSTANTS.DIR_LAMBDA + CONSTANTS.FILE_UPDATE_RECORDS_LAMBDA;
    outputFilesFromTemplate(templateUpdateRecordsFunctionPath, updateRecordsLambdaPath, jsonDataForTemplate);
    
    //更新系か参照系どちらか一方でも認証を行うならば認証用Lambdaの作成を行う
    if(isAuthUpdate || isAuthRef) {
        const templateAuthorizeFunctionPath = CONSTANTS.DIR_TEMPLATE + CONSTANTS.FILE_AUTHORIZE_LAMBDA_TEMPLATE;
        const authorizeLambdaPath = dirCdk + CONSTANTS.DIR_LAMBDA + CONSTANTS.FILE_AUTHORIZE_LAMBDA;
        outputFilesFromTemplate(templateAuthorizeFunctionPath, authorizeLambdaPath, jsonDataForTemplate);
    }
    
    //cdk-stack.ts・cdk.tsファイルを作成する
    const templateStackTsPath = CONSTANTS.DIR_TEMPLATE + CONSTANTS.FILE_CDK_STACK_TEMPLATE;
    const cdkStackFilePath = dirCdk + CONSTANTS.DIR_LIB + CONSTANTS.FILE_CDK_STACK;
    outputFilesFromTemplate(templateStackTsPath, cdkStackFilePath, jsonDataForTemplate);
    
    const templateAppTsPath = CONSTANTS.DIR_TEMPLATE + CONSTANTS.FILE_CDK_APP_TEMPLATE;
    const cdkAppFilePath = dirCdk + CONSTANTS.DIR_BIN + CONSTANTS.FILE_CDK_APP;
    outputFilesFromTemplate(templateAppTsPath, cdkAppFilePath, jsonDataForTemplate);
    
    console.info("Successfully created CdkStack for " + apiName + " " + apiVersion + "\n");
    
}

//APIGatewayスタックのデプロイ
function deployApigatewayStack(apiName: string, apiVersion: string) {
    console.info("Start deploying ApiGateway stack for " + apiName + " " + apiVersion);
    
    const dirCdk = CONSTANTS.DIR_APIS + apiName + "/" + apiVersion + "/" + CONSTANTS.DIR_CDK;
    const cdCommand = "cd " + dirCdk;
    const apigatewayStackName = "ApiGatewayStack-" + apiName + "-" + convertName(apiVersion) + " ";
    const deployCommand = "cdk deploy " + apigatewayStackName + "--require-approval never";
    
    execSync(cdCommand + " && " + deployCommand);
    
    console.info("Successfully deployed ApiGateway stack for " + apiName + " " + apiVersion + "\n");
}

//swagger-uiディレクトリのopenapi.yaml編集
async function editOpenapiSpec(apiName: string, apiVersion: string) {
    
    console.info("Start creating OpenAPI YAML files for " + apiName + " " + apiVersion);
    
    const replace = require("replace-in-file");
    const dirVersion = CONSTANTS.DIR_APIS + apiName + "/" + apiVersion + "/";

    // copy openapi.yaml to swagger-ui/dist
    const src = dirVersion + CONSTANTS.FILE_OPENAPISPEC;
    const dest = dirVersion + CONSTANTS.DIR_APIS_SWAFGGERUI + "dist/openapi.yaml";
    copyFileSync(src, dest);
        
    // swagger-initializer.jsのyamlファイルのURLを変更
    // https://petstore.swagger.io/v2/swagger.json -> openapi.yaml
    const swaggerInitializerPath = dirVersion + CONSTANTS.DIR_APIS_SWAFGGERUI + "dist/swagger-initializer.js";
    const optionsSwaggerInitializerJs = {
        files: swaggerInitializerPath,
        from: [/https:\/\/petstore.swagger.io\/v2\/swagger.json/g],
        to: ["openapi.yaml"],
    };

    await replace(optionsSwaggerInitializerJs, (error: any, changedFiles: any) => {
        if (error) return console.error("Error occurred:", error);
        for (let i = 0; i < changedFiles.length; i++) {
            console.info("Modified files:", changedFiles[i].file);
        }
    });
    const expectedApigwName = "restApi-" + apiName + "-" + convertName(apiVersion);
    const apigatewayNameArnAndBaseUrl = await getApigatewayArnNameAndUrl(expectedApigwName, undefined);
    
    const baseUrl = apigatewayNameArnAndBaseUrl.baseUrl;
    const openApiSpecPath = CONSTANTS.DIR_APIS + apiName + "/" + apiVersion + "/" + CONSTANTS.DIR_APIS_SWAFGGERUI + "dist/openapi.yaml";
    const optionsOpenApiYaml = {
        files: openApiSpecPath,
        from: [/https:\/\/your_domain.auth.ap-northeast-1.amazoncognito.com\/model/g],
        to: [baseUrl],
    }
    await replace(optionsOpenApiYaml, (error: any, changedFiles: any) => {
        if (error) return console.error("Error occurred:", error);
        for (let i = 0; i < changedFiles.length; i++) {
            console.info("Modified files:", changedFiles[i].file);
        }
    });
    
    console.info("Successfully created OpenAPI YAML files for " + apiName + " " + apiVersion + "\n");
    
}

//s3バケットスタックのデプロイ
function deployS3BucketCsvStack(apiName: string, apiVersion: string) {
    
    console.info("Start deploying S3Bucket CsvStack for " + apiName + " " + apiVersion);
    
    const dirCdk = CONSTANTS.DIR_APIS + apiName + "/" + apiVersion + "/" + CONSTANTS.DIR_CDK;
    const cdCommand = "cd " + dirCdk;
    const s3BucketCsvStackName = "S3BucketCsvStack-" + apiName + "-" + convertName(apiVersion) + " ";
    const deployCommand = "cdk deploy " + s3BucketCsvStackName + "--require-approval never";
    
    execSync(cdCommand + " && " + deployCommand);
    
    console.info("Successfully deployed S3Bucket CsvStack for " + apiName + " " + apiVersion + "\n");
    
}

//s3バケットスタックのデプロイ
function deployS3BucketStack(apiName: string, apiVersion: string) {
    
    console.info("Start deploying S3Bucket Stack for " + apiName + " " + apiVersion);
    
    const dirCdk = CONSTANTS.DIR_APIS + apiName + "/" + apiVersion + "/" + CONSTANTS.DIR_CDK;
    const cdCommand = "cd " + dirCdk;
    const s3BucketStackName = "S3BucketStack-" + apiName + "-" + convertName(apiVersion) + " ";
    const deployCommand = "cdk deploy " + s3BucketStackName + "--require-approval never";
    
    execSync(cdCommand + " && " + deployCommand);
    console.info("Successfully deployed S3Bucket Stack for " + apiName + " " + apiVersion + "\n");
}

//AWSリソースの名前・ARNの取得
async function getAwsResources(apiName: string, apiVersion: string, isAuthUpdate: boolean, isAuthRef: boolean) {
    
    console.info("Start acquiring AWS resources info for " + apiName + " " + apiVersion);
    
    //出力するjson
    let awsResourcesJson: {
        api:{
            Name: string | undefined,
            apiVersion: string | undefined,
            
            s3Bucket:{
                ARN:string| undefined,
                Name:String | undefined
            } ,
            
            SwaggerUi:{
                Url: String | undefined
            } ,
            
            table:{
                ARN:string| undefined,
                Name:String | undefined
            },
            
            apigateway:{
                ARN:string| undefined,
                Name:String | undefined,
                Url: String | undefined
            } ,
            
            Lambda:{
                authorizeFunc:{
                    ARN:string| undefined,
                    Name:String | undefined
                },
                deleteAllFunc:{
                    ARN:string| undefined,
                    Name:String | undefined
                } ,
                deleteRecordFunc:{
                    ARN:string| undefined,
                    Name:String | undefined
                } ,
                getRecordFunc:{
                    ARN:string| undefined,
                    Name:String | undefined
                } ,
                registerhFunc:{
                    ARN:string| undefined,
                    Name:String | undefined
                } ,
                searchFunc: {
                    ARN:string| undefined,
                    Name:String | undefined
                } ,
                updateRecordFunc: {
                    ARN:string| undefined,
                    Name:String | undefined
                } ,
                updateRecordsFunc: {
                    ARN:string| undefined,
                    Name:String | undefined
                } ,
            }
        }
    } = 
    {
        api:{
            
            Name: apiName,
            apiVersion: apiVersion,
            
            s3Bucket:{
                Name:"",
                ARN:""
            },
            SwaggerUi:{
                Url:""
            },
            
            table:{
                Name:"",
                ARN:""
            },
            
            apigateway:{
                Name:"",
                ARN:"",
                Url:""
            },
            Lambda:{
                authorizeFunc:{
                    Name:"",
                    ARN:""
                },
                deleteAllFunc:{
                    Name:"",
                    ARN:""
                } ,
                deleteRecordFunc:{
                    Name:"",
                    ARN:""
                } ,
                getRecordFunc:{
                    Name:"",
                    ARN:""
                } ,
                registerhFunc:{
                    Name:"",
                    ARN:""
                } ,
                searchFunc: {
                    Name:"",
                    ARN:""
                } ,
                updateRecordFunc: {
                    Name:"",
                    ARN:""
                } ,
                updateRecordsFunc: {
                    Name:"",
                    ARN:""
                } ,
            }
        }
    }
    
    const isAuth: boolean = isAuthUpdate || isAuthRef;
    
    //コマンドの実行
    const dynamoDbName = "dynamodb-" + apiName + "-" + convertName(apiVersion);
    
    const getRecordLambdaName = "getRecordLambda-" + apiName + "-" + convertName(apiVersion);
    const registerLambdaName = "registerLambda-" + apiName + "-" + convertName(apiVersion);
    const searchLambdaName = "searchLambda-" + apiName + "-" + convertName(apiVersion);
    const authorizeLambdaName = "authorizeLambda-" + apiName + "-" + convertName(apiVersion);

    const deleteAllLambdaName = "deleteAllLambda-" + apiName + "-" + convertName(apiVersion);
    const deleteRecordLambdaName = "deleteRecordLambda-" + apiName + "-" + convertName(apiVersion);
    const updateRecordLambdaName = "updateRecordLambda-" + apiName + "-" + convertName(apiVersion);
    const updateRecordsLambdaName = "updateRecordsLambda-" + apiName + "-" + convertName(apiVersion);
    
    const apigatewayName = "restApi-" + apiName + "-" + convertName(apiVersion);
    const s3BucketName = "s3bucketname-" + apiName + "-" + convertName(apiVersion);
    
    //DynamoDB
    const dynamoDbArnAndName = await getDynamoDbArnAndName(dynamoDbName);
    awsResourcesJson.api.table.ARN = dynamoDbArnAndName.arn
    awsResourcesJson.api.table.Name = dynamoDbArnAndName.name;
    
    //Lambda
    const getRecordLambdaArnAndName = await getLambdaArnAndName(getRecordLambdaName);
    awsResourcesJson.api.Lambda.getRecordFunc.ARN = getRecordLambdaArnAndName.arn;
    awsResourcesJson.api.Lambda.getRecordFunc.Name = getRecordLambdaArnAndName.name;
    
    const registerLambdaArnAndName = await getLambdaArnAndName(registerLambdaName);
    awsResourcesJson.api.Lambda.registerhFunc.ARN = registerLambdaArnAndName.arn;
    awsResourcesJson.api.Lambda.registerhFunc.Name = registerLambdaArnAndName.name;
    
    const searchLambdaArnAndName = await getLambdaArnAndName(searchLambdaName);
    awsResourcesJson.api.Lambda.searchFunc.ARN = searchLambdaArnAndName.arn;
    awsResourcesJson.api.Lambda.searchFunc.Name = searchLambdaArnAndName.name;
    
    if(isAuth){
        const authorizeLambdaArnAndName = await getLambdaArnAndName(authorizeLambdaName);
        awsResourcesJson.api.Lambda.authorizeFunc.ARN = authorizeLambdaArnAndName.arn;
        awsResourcesJson.api.Lambda.authorizeFunc.Name = authorizeLambdaArnAndName.name;
    }

    const deleteAllLambdaArnAndName = await getLambdaArnAndName(deleteAllLambdaName);
    awsResourcesJson.api.Lambda.deleteAllFunc.ARN = deleteAllLambdaArnAndName.arn;
    awsResourcesJson.api.Lambda.deleteAllFunc.Name = deleteAllLambdaArnAndName.name;

    const deleteRecordLambdaArnAndName = await getLambdaArnAndName(deleteRecordLambdaName);
    awsResourcesJson.api.Lambda.deleteRecordFunc.ARN = deleteRecordLambdaArnAndName.arn;
    awsResourcesJson.api.Lambda.deleteRecordFunc.Name = deleteRecordLambdaArnAndName.name;

    const updateRecordLambdaArnAndName = await getLambdaArnAndName(updateRecordLambdaName);
    awsResourcesJson.api.Lambda.updateRecordFunc.ARN = updateRecordLambdaArnAndName.arn;
    awsResourcesJson.api.Lambda.updateRecordFunc.Name = updateRecordLambdaArnAndName.name;

    const updateRecordsLambdaArnAndName = await getLambdaArnAndName(updateRecordsLambdaName);
    awsResourcesJson.api.Lambda.updateRecordsFunc.ARN = updateRecordsLambdaArnAndName.arn;
    awsResourcesJson.api.Lambda.updateRecordsFunc.Name = updateRecordsLambdaArnAndName.name;
    
    //APIGateway、第二引数はSDKのGetRestApisCommandのinputのposition
    const apigatewayNameArnAndBaseUrl = await getApigatewayArnNameAndUrl(apigatewayName, undefined);
    awsResourcesJson.api.apigateway.Name = apigatewayNameArnAndBaseUrl.name;
    awsResourcesJson.api.apigateway.ARN = apigatewayNameArnAndBaseUrl.arn;
    awsResourcesJson.api.apigateway.Url = apigatewayNameArnAndBaseUrl.baseUrl;

    //S3Bucket
    const s3ArnNameAndUrl = await getS3ObjectArnNameAndUrl(s3BucketName);
    awsResourcesJson.api.s3Bucket.Name = s3ArnNameAndUrl.name
    awsResourcesJson.api.s3Bucket.ARN = s3ArnNameAndUrl.arn
    awsResourcesJson.api.SwaggerUi.Url = s3ArnNameAndUrl.swaggerUiUrl
    
    //jsonファイルの出力
    const awsResoucesJsonFilePath = CONSTANTS.DIR_APIS + apiName + "/" + apiVersion + "/" +CONSTANTS.FILE_AWS_RESOURCES_JSON;
    writeFileSync(awsResoucesJsonFilePath, JSON.stringify(awsResourcesJson, null, 2));
    
    console.log("AWS resources info written to " + awsResoucesJsonFilePath);
    console.info("Successfully acquired AWS resources info for " + apiName + " " + apiVersion + "\n");
    
}

//apiのテストファイル作成
async function makeTest(apiName: string, apiVersion: string, jsonDataForTemplate: object) {
    
    console.info("Start creating JS test files for " + apiName + " " + apiVersion);
    
    const replace = require("replace-in-file");
        
    const testFilePath = CONSTANTS.DIR_APIS + apiName + "/" + apiVersion + "/cdk/test/" + "cdk.test.ts";
    
    const templateApiTestFilePath = CONSTANTS.DIR_TEMPLATE + CONSTANTS.FILE_API_TEST_TEMPLATE;
    outputFilesFromTemplate(templateApiTestFilePath, testFilePath, jsonDataForTemplate);
    
    const awsResourcesJsonPath = CONSTANTS.DIR_APIS + apiName + "/" + apiVersion + "/" + CONSTANTS.FILE_AWS_RESOURCES_JSON;
    const awsResourcesFile = readFileSync(awsResourcesJsonPath, CONSTANTS.CHARACTER_CODE_UTF8);
    const awsResourcesJson = JSON.parse(awsResourcesFile);
    const url = awsResourcesJson.api.apigateway.Url;
    
    const optionsApiTest = {
        files: testFilePath,
        from: [/https:\/\/your_domain.auth.ap-northeast-1.amazoncognito.com\/model/g],
        to: [url],
    }
    await replace(optionsApiTest, (error: any, changedFiles: any) => {
        if (error) return console.error("Error occurred:", error);
        for (let i = 0; i < changedFiles.length; i++) {
            console.info("Modified files:", changedFiles[i].file);
        }
    });
    
    console.info("Successfully created JS test files for " + apiName + " " + apiVersion + "\n");
    
}

//テンプレートからファイルを出力する
function outputFilesFromTemplate(templateFilePath: string, outputFilePath: string, jsonData: object) {
    const template = readFileSync(templateFilePath, CONSTANTS.CHARACTER_CODE_UTF8);//templateの読み込み
    const outputFile = Mustache.render(template, jsonData);//Mustacheを使ってテンプレートの変数部分を変換
    writeFileSync(outputFilePath, outputFile, CONSTANTS.CHARACTER_CODE_UTF8);//出力
}

//ディレクトリのコピー
function copyDirectory(sourceDir: string, targetDir: string) {
  // ディレクトリが存在しない場合、作成
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  // ソースディレクトリ内のファイルとサブディレクトリをリストアップ
  const contents = readdirSync(sourceDir);

  for (const content of contents) {
    const sourcePath = path.join(sourceDir, content);
    const targetPath = path.join(targetDir, content);

    // ファイルの場合
    if (statSync(sourcePath).isFile()) {
      copyFileSync(sourcePath, targetPath);
    }
    // サブディレクトリの場合
    else if (statSync(sourcePath).isDirectory()) {
      copyDirectory(sourcePath, targetPath);
    }
  }
}

//DynamoDBテーブルのARN名前取得
async function getDynamoDbArnAndName(dynamoDbName: string) {
    const dynamoDbClient = new DynamoDBClient(CONFIG);
    const inputTable = { TableName: dynamoDbName, };
    const commandTable = new DescribeTableCommand(inputTable);
    const responseDynamoDb = await dynamoDbClient.send(commandTable);
    if(!responseDynamoDb || !responseDynamoDb.Table){
        const message = dynamoDbName + "が見つかりません。"
        throw new AwsResourceNotFoundError(message);
    }
    const dynamoDbArnAndName = {
        arn: responseDynamoDb.Table.TableArn,
        name: responseDynamoDb.Table.TableName,
    }
    return dynamoDbArnAndName;
}

//Lambda関数のARN名前取得
async function getLambdaArnAndName(lambdaName: string) {
    const lambdaClient = new LambdaClient(CONFIG);
    const inputLambda = { FunctionName: lambdaName, };
    const commandLambda = new GetFunctionCommand(inputLambda);
    const responseLambda: GetFunctionCommandOutput = await lambdaClient.send(commandLambda);
    if(!responseLambda || !responseLambda.Configuration){
        const message = lambdaName + "が見つかりません。"
        throw new AwsResourceNotFoundError(message);
    }
    const lambdaArnAndName = {
        arn: responseLambda.Configuration.FunctionArn,
        name: responseLambda.Configuration.FunctionName,
    }
    return lambdaArnAndName;
}

//APIGatewayのARN名前URL取得
async function getApigatewayArnNameAndUrl(apigatewayName: string, position: string|undefined):Promise<{name:string,arn:string,baseUrl:string}>{
    const client = new APIGatewayClient(CONFIG);
    const input = {
        limit: 500,
        position: position,
    };
    const command = new GetRestApisCommand(input);
    const response = await client.send(command);
    if(!response || !response.items){
        const message = "SDKでAPIGatewayの検索時にエラーが発生しました。"
        throw new AwsResourceNotFoundError(message);
    }
    for(const item of response.items){
        if(item.name === apigatewayName){
            const restApiId = item.id;
            const restApiName = item.name;
            const baseUrl = `https://${restApiId}.execute-api.${CONSTANTS.AWS_REGION}.amazonaws.com/prod`;
            const arn = "arn:aws:apigateway:" + CONSTANTS.AWS_REGION + "::/restapis/" + restApiId;
            const apigatewayNameArnAndBaseUrl = {
                name: restApiName,
                arn: arn,
                baseUrl: baseUrl,
            }
            return apigatewayNameArnAndBaseUrl;
        }
    }
    //positionがundefinedの場合は、指定した名前のrestApiを見つけられなかったということ
    if(!response.position) {
        const message = apigatewayName + "が見つかりません。"
        throw new AwsResourceNotFoundError(message);
    }
    //指定したポジション内では、指定した名前のrestApiを見つけられなかった場合、次のpositionへ
    return getApigatewayArnNameAndUrl(apigatewayName, response.position);
}

//S3BucketのオブジェクトURL取得
async function getS3ObjectArnNameAndUrl(s3BucketName: string) {
    const arn = "arn:aws:s3:::" + s3BucketName;
    const name = s3BucketName;
    const swaggerUiUrl = "https://" + s3BucketName + ".s3." + CONSTANTS.AWS_REGION + ".amazonaws.com/swaggerui/index.html";
    
    const s3ArnNameAndUrl = {
        arn: arn,
        name: name,
        swaggerUiUrl: swaggerUiUrl,
    }
    return s3ArnNameAndUrl;
}

//1件登録用のチェック部分作成
function makeCheckRequestBody(property: property) {
    const templateFilePath = CONSTANTS.DIR_TEMPLATE + CONSTANTS.FILE_CHECK_REQUEST_BODY;
    const template = readFileSync(templateFilePath, CONSTANTS.CHARACTER_CODE_UTF8);
    let checkRegisterProgram = Mustache.render(template, property);
    
    for(const prop of property.properties){
        if(CONSTANTS.PROPERTY_TYPE_OBJECT === prop.type){
            const names = {
                propName: prop.name,
                propertyName: property.name,
            }
            checkRegisterProgram += Mustache.render("   const {{propName}} = {{propertyName}}.{{propName}};", names);
            checkRegisterProgram += makeCheckRequestBody(prop);
        }
    }
    return checkRegisterProgram;
}