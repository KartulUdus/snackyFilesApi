const express = require('express')
const jwt = require('jsonwebtoken')
const axios = require('axios')
const config = require('config')

const app = express()
const bodyParser = require('body-parser')

app.use(bodyParser.json())

let fileStatusObj = {}

const verifyToken = (req, res, next) => {
	const bearerHeader = req.headers.authorization
	if (typeof bearerHeader !== 'undefined') {
		const bearer = bearerHeader.split(' ')
		const [, token] = bearer
		req.token = token
		next()
	} else {
		// Forbidden
		res.sendStatus(403)
	}
}

app.post('/auth', (req, res) => {
	if (!req.body || req.body.publicKey !== config.publicKey) return res.sendStatus(403)
	jwt.sign({}, 'secretkey', { expiresIn: '30m' }, (err, token) => {
		res.json({
			token,
		})
	})
})

app.get('/file/:fileId', verifyToken, (req, res) => {
	jwt.verify(req.token, 'secretkey', async (err) => {
		if (err) {
			res.sendStatus(403)
		} else {
			const { fileId } = req.params
			if (!fileStatusObj[fileId]) {
				res.status(404).send('File doesn\'t exist')
				throw 'File doesn\'t exist'
			}

			if (fileStatusObj[fileId] !== 'FINISHED') {
				res.status(400).send(fileStatusObj[fileId] === 'PROCESSING'
					? 'File is not done processing' : 'File processing has failed')
				throw 'File is not done processing or file processing has failed'
			}

			const detailsRes = await axios.get(`http://interview-api.snackable.ai/api/file/details/${fileId}`)
			const segmentsRes = await axios.get(`http://interview-api.snackable.ai/api/file/segments/${fileId}`)
			const response = {}
			response.details = detailsRes.status === 200 ? detailsRes.data : {}
			response.segments = segmentsRes.status === 200 ? segmentsRes.data : []

			res.json(response)
		}
	})
})

const getFileStatuses = async () => {
	const result = {}
	let moreResults = true
	let offset = 0

	while (moreResults) {
		const { data, status } = await axios.get(`http://interview-api.snackable.ai/api/file/all?offset=${offset}`)
		if (status === 200) {
			data.forEach((file) => result[file.fileId] = file.processingStatus)
			offset += data.length
		}
		if (data.length < 5) moreResults = false
	}
	return result
}

async function main() {
	fileStatusObj = await getFileStatuses()
	app.listen(5000, () => console.log('Server started on port 5000'))
}

main()
