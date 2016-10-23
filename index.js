const express = require('express')
const morgan = require('morgan')
const nodeify = require('bluebird-nodeify')
const fs = require('fs')
const path = require('path')
const mime = require('mime-types')
const rimraf = require('rimraf')
const mkdirp = require('mkdirp')

require('songbird')

const NODE_ENV = process.env.NODE_ENV || 'development'
const PORT = process.env.PORT || 8000
const ROOT_DIR = path.resolve(process.cwd()) 
const app = express() 
NODE_ENV === 'development' && app.use(morgan('dev'))

app.listen(PORT, () => console.log(`Listening @ http://127.0.0.1:${PORT}`))

app.get('*', setFileMeta, sendHeaders, (req, res) => {
  if(res.body) {
    res.json(res.body)
    return
  }
  fs.createReadStream(req.filePath).pipe(res)  
}) 

app.head('*', setFileMeta, sendHeaders, (req, res, next) => {

})

app.delete('*', setFileMeta, (req, res, next) => {
  (async () => {
    if(!req.stat) {
      return res.status(400).send('Invalid Path')
    } else if(req.stat.isDirectory()) {
      await rimraf.promise(req.filePath)      
    } else {
      await fs.promise.unlink(req.filePath)
    }
    res.end()
  })().catch(next)
})


app.put('*', setFileMeta, setDirDetails, (req, res, next) => {
  (async () => {
    if(req.stat) return res.status(405).send('File exists')

    await mkdirp.promise(req.dirPath)  
    
    if (!req.isDir) {
      req.pipe(fs.createWriteStream(req.filePath))
    }
    res.end()
  })().catch(next) 
})

app.post('*', setFileMeta, setDirDetails, (req, res, next) => {
  (async () => {
    if(!req.stat) return res.status(405).send('File does not exist')
    if(req.isDir) return res.status(405).send('Path is a directory')
    
    fs.promise.truncate(req.filePath, 0)
    req.pipe(fs.createWriteStream(req.filePath))
    res.end()
  })().catch(next) 
})

function setDirDetails(req, res, next) {
  const filePath = req.filePath
  const endWithSlash = filePath.charAt(filePath.length -1) === path.sep
  const hasExt = path.extname(filePath) !== ''
  req.isDir = endWithSlash || !hasExt
  req.dirPath = req.isDir ? filePath : path.dirname(filePath)
  next()
}
function setFileMeta(req, res, next) {
  const filePath = path.resolve(path.join(ROOT_DIR, req.url))
  req.filePath = filePath
  if(filePath.indexOf(ROOT_DIR) !== 0) {
    res.send(400, 'Invalid path')
    return
  } 
  fs.promise.stat(filePath) 
    .then(stat => req.stat = stat, () => req.stat = null)
    .nodeify(next)
}

function sendHeaders(req, res, next) {
  nodeify((async () => {
    const filePath = req.filePath
    if (req.stat.isDirectory()) { 
      const files = await fs.promise.readdir(filePath) 
      res.body = JSON.stringify(files.length) 
      res.setHeader('Content-Length', res.body.length) 
      res.setHeader('Content-Type', 'application/json') 
      return 
    } 

    res.setHeader('Content-Length', req.stat.size) 
    const contentType = mime.contentType(path.extname(filePath))
    res.setHeader('Content-Type', contentType) 
  }) (), next)
}
