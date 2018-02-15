const jwt = require('jsonwebtoken');
const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const cors = require('cors');
const mysql = require('mysql');
const mysqlModel = require('mysql-model');
const SqlString = require('sqlstring');
const fs = require('fs');
const multer = require('multer');
const formidable = require('formidable');
const path = require('path');
const bcrypt = require('bcrypt-nodejs');
const isUserAuth = require('./app/utils/isUserAuth');
const Decoded = require('./app/utils/handleToken');
const Config = require('./config');
const _ = require('lodash');

let FileName = '';

const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, `/root/users/${req.body.username}/`);
    },
    filename(req, file, cb) {
        filename = generateFilename(file.originalname);
        cb(null, filename);
    }
});

const upload = multer({storage: storage});

const MyAppModel = mysqlModel.createConnection(Config.mySQL);
const User = MyAppModel.extend({tableName: ""});
const Project = MyAppModel.extend({tableName: ""});

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));

app.get('/assets/img/:user/:filename', (req, res) => {
    console.log("Req.params", req.params);
    const ex = fs.existsSync(`/root/users/${req.params.user}/${req.params.filename}`);
    if (!ex) {
        res.send("No such file");
        return;
    } else
        res.sendFile(`${req.params.filename}`, {
            root: path.join(__dirname, `../../users/${req.params.user}`)
        });
    }
)

app.post('/register', async (req, res) => {

    console.log("Req.body", req.body);

    if (!req.body.token) {
        res.json({error: 'Token is empty'});
        return;
    }

    const authResult = isUserAuth(req.body.token, '');
    if (!authResult) {
        res.json({status: 'ERR', message: 'INVALID TOKEN'});
        return;
    }

    let saltPassword = '';
    const result = await bcrypt.genSalt(10, (err, salt) => {
        if (err) {
            throw err;
        }
        bcrypt.hash(req.body.form.password, salt, null, (err, hash) => {
            if (err) {
                throw err;
            }
            saltPassword = hash;
        });
    });

    const validUser = {
        login: req.body.form.login,
        password: saltPassword,
        email: req.body.form.email
    }
    console.log('Result', result);
    console.log("saltPassword", saltPassword);

    const query = SqlString.format('login LIKE ? ', validUser.login);
    const user = new User(validUser);

    const reponse = await user.find('all', {
        where: query
    }, (err, rows) => {
        console.log("Rows", rows);
        if (rows.length !== 0) {
            res.json({status: 'ERR', errorField: 'username', error: 'Istnieje już użytkownik o takiej nazwie'});
            return;
        } else {
            fs.mkdirSync(`/root/users/${validUser.login}`);
            user.save((err) => {
                console.log("Err", err);
                res.json({status: 'OK'});
            });
        }
    });

});

app.post('/login', (req, res) => {
    console.log("Req.body", req.body);

    userProps = {
        login: req.body.form.login,
        password: req.body.form.password
    }
    const user = new User(userProps);

    const query = SqlString.format('login LIKE ? ', userProps.login);
    console.log("Query", query);

    user.find('all', {
        where: query
    }, (err, rows) => {
        console.log("Rows", rows);
        const usr = rows[0];
        if (!usr) {
            res.json({status: 'Error', error: true, errorField: 'login'});
        } else if (!bcrypt.compareSync(userProps.password, usr.password)) {
            res.json({status: 'Error', error: true, errorField: 'password'});
        } else {
            const token = jwt.sign({
                username: usr.login
            }, '');
            res.json({status: 'OK', token});
        }
    });

})

app.post('/find-user', (req, res) => {

    if (!req.body.token) {
        res.json({status: 'ERROR', message: 'Unauthorized request'});
        return;
    }

    const authResult = isUserAuth(req.body.token, '');
    if (!authResult) {
        res.json({status: 'ERROR', message: 'Incorrect token'});
        return;
    }

    const decoded = Decoded(req.body.token);

    const user = new User();
    query = SqlString.format('login LIKE ? ', decoded.login);
    console.log("Query", query);
    user.find('all', {
        where: query
    }, (err, rows) => {
        if (err) {
            res.json({status: 'ERR'});
            return;
        } else if (rows.length === 0) {
            res.json({status: 'ERROR', message: 'User not found'});
            return;
        } else {
            res.json({status: 'OK'});
        }

    })
})

app.post('/create-project', (req, res) => {
    console.log("Create project req.body".req.body);
    const project = new Project(req.body.form);
    project.save((err) => {
        if (err) {
            console.log("err", err);
        }
    });
});

app.post('/get-user-projects', (req, res) => {
    if (!req.body.token) {
        res.json({status: 'ERROR', message: 'Unauthorized request'});
        return;
    }

    const authResult = isUserAuth(req.body.token, '');
    if (!authResult) {
        res.json({status: 'ERR', message: 'INVALID TOKEN'});
        return;
    }

    const decoded = Decoded(req.body.token);
    console.log("Get user projects!", req.body);
    const project = new Project();
    query = SqlString.format('owner LIKE ? ', decoded.login);
    project.find('all', {
        where: query
    }, (err, rows) => {
        console.log("Rows found", rows);

        if (rows.length !== 0) {
            _.forEach(rows, (project) => {
                delete project.createdAt;
            });
            res.json({status: 'OK', projects: rows});
        } else {
            res.json({status: 'OK', projects: [{}]});
        }
    });
})

app.post('/add-user-project', (req, res) => {
    if (!req.body.token) {
        res.json({status: 'ERROR', message: 'Unauthorized request'});
        return;
    }

    const authResult = isUserAuth(req.body.token, '');
    if (!authResult) {
        res.json({status: 'ERR', message: 'INVALID TOKEN'});
        return;
    }

    const decoded = Decoded(req.body.token);
    console.log("Add user project!", req.body);

    const validProject = {
        title: req.body.project.title,
        description: req.body.project.description,
        imgUrl: filename,
        owner: req.body.project.username
    }

    console.log("Valid Project", validProject);
    const project = new Project(validProject);
    project.save((err) => {
        if (err) {
            console.log("err", err);
            res.json({status: "ERR"});
            return;
        }
    });
    res.json({status: 'OK'});
})

app.post('/upload', upload.any(), (req, res) => {
    console.log("Req.files -> upload", req.files);
    console.log("Req.body -> upload", req.body);
    res.json({status: 'OK'});
});

app.post('/get-user-email', (req, res) => {
    if (!req.body.token) {
        res.json({status: 'ERROR', message: 'Unauthorized request'});
        return;
    }

    const authResult = isUserAuth(req.body.token, '');
    const decoded = Decoded(req.body.token);

    if (!decoded.login) {
        res.json({status: 'ERR', message: `Login wasn't provided`});
        return;
    }

    const userProps = {
        login: decoded.login
    }

    const user = new User(userProps);
    const query = SqlString.format('login LIKE ? ', decoded.login);

    user.find('all', {
        where: query
    }, (err, rows) => {
        console.log("Rows", rows);
        const usr = rows[0];
        if (!usr) {
            res.json({status: 'Error', error: true, errorField: 'login'});
        } else {
            const email = usr.email;
            res.json({status: 'OK', email});
        }
    });

})

app.post('/remove-project', (req, res) => {
    if (!req.body.token) {
        res.json({status: 'ERROR', message: 'Unauthorized request'});
        return;
    }

    const authResult = isUserAuth(req.body.token, '');
    if (!authResult) {
        res.json({status: 'ERR', message: 'INVALID TOKEN'});
        return;
    }

    const decoded = Decoded(req.body.token);
    console.log("Remove user project!", req.body);
    const project = new Project();
    const query = SqlString.format('imgUrl LIKE ? ', req.body.project.imgUrl);

    project.find('all', {
        where: query
    }, (err, rows) => {
        console.log("Rows found", rows);
        if (rows.length !== 0) {
            const owner = rows[0].owner;
            const imgUrl = rows[0].imgUrl;
            project.remove(query, (err, resp) => {
                if (err) {
                    res.json({status: 'ERR', desc: err});
                    return;
                }
            });
            res.json({status: 'OK'});
            fs.unlinkSync(`/root/users/${owner}/${imgUrl}`);
        } else {
            res.json({status: 'Err', desc: ' Project not found'});
        }
    });
})

app.post('/update-settings', async (req, res) => {
    if (!req.body.token) {
        res.json({status: 'ERROR', message: 'Unauthorized request'});
        return;
    }
    const authResult = isUserAuth(req.body.token, '');
    if (!authResult) {
        res.json({status: 'ERR', message: 'INVALID TOKEN'});
        return;
    }
    const form = req.body.settingsForm;
    if (!form) {
        res.json({status: 'ERR', message: 'Invalid settings form'});
        return;
    }
    console.log("Req.body", req.body);
    const user = new User();
    console.log("User", user);
    const query = SqlString.format('login LIKE ? ', req.body.settingsForm.username);
    user.find('all', {
        where: query
    }, async (err, rows) => {
        if (!rows[0]) {
            res.json({status: 'ERR'});
            return
        }
        console.log("User found", user);
        console.log("Rows found", rows[0]);
        const newEmail = req.body.settingsForm.email;
        const username = req.body.settingsForm.username;
        const updateQuery = SqlString.format(`UPDATE users SET email='${newEmail}' WHERE login='${username}'`);
        user.query(updateQuery, (err) => {
            if(err) {
                console.log("Err", err);
                res.json({
                    status: 'ERR',
                    desc: err
                });
                return;
            }
        })
        res.json({status: 'OK'});
    })
})

const generateFilename = (originalName) => {
    const arr = originalName.split('.');
    const ext = arr[1];
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for (var i = 0; i < 10; i++)
        text += possible.charAt(Math.floor(Math.random() * possible.length));

    return text + '.' + ext;
}

app.listen(4005, () => {
    console.log("Listening on port 4005!");
});
