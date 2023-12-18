const superagent = require("superagent");
const cheerio = require("cheerio");
const fs = require("fs");
const NeDB = require("nedb");

const cookie = fs.readFileSync("./cookie.txt", "utf-8").split(";");
const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const onlineVerification = "{ABA4BB58-E330-4bb0-8255-BB4A56933B28}";
const onlineTime = "{0E2B03FC-4954-4eda-9B12-24388855D5E1}";
const lastRefreshTime = "{0E2B03FC-4954-4eda-9B33-24388855D5EC}";
const cookieMap = convertCookieArrayToMap(cookie);

const saveMailFolder = "./MailFolder/";
const dataBaseFolder = "./DataBase/";
const mailDBSet = "mail.db";

function convertCookieArrayToMap(cookieArray) {
  if (cookieArray) {
    let cookieMap = new Map();
    cookieArray.forEach((item) => {
      let itemArray = item.split("=");
      cookieMap.set(itemArray.shift().trim(), itemArray.join("="));
    })
    return cookieMap;
  } else {
    return null;
  }
}

function joinMapToString(cookieMap) {
  let cookie = "";
  cookieMap.forEach((value, key) => {
    if (value) {
      cookie = cookie + key + "=" + value.replace(/\n/g, "") + "; ";
    } else {
      cookie = cookie + key + "=" + value + "; ";
    }
  })
  return cookie;
}

function onlineCheck() {
  const timestamp = Date.now();
  const formattedDate = new Date(timestamp).toString();
  const url = "https://jxoa.jxt189.com/jascx/Online.aspx?t3=" + encodeURIComponent(formattedDate) + "&check=true";
  const cookieTemp = joinMapToString(cookieMap);
  superagent.get(url)
    .set("User-Agent", userAgent)
    .set("Cookie", cookieTemp)
    .end((err, res) => {
      console.log(res.headers);
      const setCookies = convertCookieArrayToMap(res.headers["set-cookie"]);
      if (setCookies) {
        if (setCookies.has(onlineVerification)) {
          console.log(setCookies.get(onlineVerification));
          cookieMap.set(onlineVerification, setCookies.get(onlineVerification));
          fs.writeFileSync("./cookie.txt", joinMapToString(cookieMap), "utf-8");
        }
      }
    })
}

function downloadMailFile(cookieString, dirName, fileName, mailId) {
  const url = "https://jxoa.jxt189.com/jascx/InternalMail/DownLoad.aspx?dir=" +
    encodeURIComponent(dirName) +
    "&file=" + encodeURIComponent(fileName) +
    "&mailId=" + mailId;
  return new Promise((resolve, reject) => {
    superagent.get(url)
      .set("User-Agent", userAgent)
      .set("Cookie", cookieString)
      .responseType('blob')
      .end((err, res) => {
        if (err) {
          reject(err);
        } else {
          const fileData = res.body;
          let saveFilePath = saveMailFolder + (fileName.replace("File\\", ""));
          fs.writeFile(saveFilePath, fileData, (err) => {
            if (err) {
              reject(err);
            } else {
              resolve('文件下载完成');
            }
          });
        }

      })
  })
}

function getMailPages() {
  const url = "https://jxoa.jxt189.com/jascx/InternalMail/MailIncept.aspx";
  return new Promise((resolve, reject) => {
    superagent.get(url)
      .set("User-Agent", userAgent)
      .set("Cookie", joinMapToString(cookieMap))
      .end((err, res) => {
        if (err) { reject(err); } else {
          const $ = cheerio.load(res.text);
          let pageCount = $($(".divTitle36z")[0]).find("a").attr("href").split("&")[4].split("=")[1];
          resolve(pageCount);
        }
      })
  })
}

function folderExisted(folderPath) {
  try {
    fs.statSync(folderPath);
    console.log(folderPath + " 文件夹已经存在！");
  } catch (err) {
    fs.mkdirSync(folderPath);
    console.log("创建 " + folderPath);
  }
}

function openDataBase(dataBaseFile) {
  return new NeDB({
    filename: dataBaseFolder + dataBaseFile,
    autoload: true
  });
}

function insertDataToMailDB(mailId, sendTime, mailTitle, attachmentPath, content) {
  const db = openDataBase(mailDBSet);
  db.insert({
    _id: mailId,
    sendTime: sendTime,
    title: mailTitle,
    attachment: attachmentPath,
    content: content
  })
}

async function getMailList(url) {
  const res = await superagent.get(url)
    .set("User-Agent", userAgent)
    .set("Cookie", joinMapToString(cookieMap))
  const $ = cheerio.load(res.text);
  const promises = [];
  $(".divTitle36z").each(function () {
    const internalMail = "https://jxoa.jxt189.com/jascx/InternalMail/";
    const mailView = internalMail + $(this).find("a").attr("href");
    const promise = superagent.get(mailView)
      .set("User-Agent", userAgent)
      .set("Cookie", joinMapToString(cookieMap))
      .then((res) => {
        const $ = cheerio.load(res.text);
        const attachment = $(".formTable_ItemInput>a");
        const attachmentCount = attachment.length;

        let mailData = {
          id: "",
          title: $("#lbl_Title").text(),
          attachment: [],
          content: $(".viewInput2").text(),
          sendTime: new Date($("#lbl_SendTime").text()).getTime(),
        };

        if (attachmentCount >= 1) {
          attachment.each((err, element) => {
            const fileHref = $(element).attr("href");
            if (fileHref !== undefined) {
              const a = fileHref.replace("javascript:void NengLong_CMP_InternalMail_AttachInput_DownLoadFile(", "").replace(");", "").split(" , ");
              a.forEach(function (value, key, array) {
                array[key] = value.trim().replace(/^'|'$/g, '').replace(/\\x/g, "%");
                array[key] = decodeURIComponent(JSON.parse(`"${array[key]}"`));
              });
              console.log("下载： " + a[2]);
              mailData.id = a[1];
              mailData.attachment.push(saveMailFolder + (a[2].replace("File\\", "")));
              return downloadMailFile(joinMapToString(cookieMap), a[0], a[2], a[1])
            }
          });
        }
        insertDataToMailDB(mailData.id, mailData.sendTime, mailData.title, mailData.attachment, mailData.content);
      });
    promises.push(promise);
  });
  await Promise.all(promises);
}


async function main() {
  folderExisted(saveMailFolder);
  folderExisted(dataBaseFolder);
  onlineCheck();
  const intervalId = setInterval(onlineCheck, 30000); // 1000毫秒，即1秒
  const url = "https://jxoa.jxt189.com/jascx/InternalMail/MailIncept.aspx";
  const pageCount = await getMailPages();
  for (let index = 1; index <= Number(pageCount); index++) {
    await getMailList(url + "?page=" + index);
  }
}

main().catch(err => {
  console.error(err);
})

// const test1 = "https://jxoa.jxt189.com/jascx/InternalMail/MailView.aspx?id=706585&viewType=0&pageSize=20&curentPage=1&pageCount=82&orderBy=[sendTime]%20DESC&department=0&isWithSub=0&sno=0&from=";
// const test2 = "https://jxoa.jxt189.com/jascx/InternalMail/MailView.aspx?id=706390&viewType=0&pageSize=20&curentPage=1&pageCount=82&orderBy=[sendTime]%20DESC&department=0&isWithSub=0&sno=1&from=";
// superagent.get(test2)
//   .set("User-Agent", userAgent)
//   .set("Cookie", joinMapToString(cookieMap))
//   .end((err, res) => {
//     const $ = cheerio.load(res.text);
//     $(".formTable_ItemInput>a").each((index, element) => {
//       console.log($(element).html());
//     });
//   })