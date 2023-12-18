const express = require("express");
const router = express.Router();
const NeBD = require("nedb");
const {createMailZipArchive} = require("./utils");
const db = new NeBD({
  filename: "./DataBase/mail.db",
  autoload: true
});

router.get("/mail", function (req, res) {
  db.find({}, (err, doc) => {
    res.json(doc);
  })
})

router.get("/mail/:id", function (req, res) {
  db.find({ _id: req.params.id }, (err, doc) => {
    if (doc[0].attachment.length > 1) {
      createMailZipArchive(doc[0].attachment, "./MailFolder/"+doc[0].title+".zip").then(()=>{
        res.setHeader('X-File-Name', encodeURIComponent(doc[0].title+".zip"));
        res.download("./MailFolder/"+doc[0].title+".zip");
      });
    } else {
      let filename =  doc[0].attachment[0].replace("./MailFolder/", "");
      res.setHeader('X-File-Name', encodeURIComponent(filename))
      res.download(doc[0].attachment[0],filename);
    };
  })
})

module.exports = router;