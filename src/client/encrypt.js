'use strict'

const crypto = require('crypto')
const yggserver = require('yggdrasil').server({})
const debug = require('debug')('minecraft-protocol')

module.exports = function (client, options) {
  client.once('encryption_begin', onEncryptionKeyRequest)

  function onEncryptionKeyRequest (packet) {
    crypto.randomBytes(16, gotSharedSecret)

    function gotSharedSecret (err, sharedSecret) {
      // NOPR: Allow passing in a brand-new shared secret
      sharedSecret = options.sharedSecret || sharedSecret
      if (err) {
        debug(err)
        client.emit('error', err)
        client.end()
        return
      }
      if (options.haveCredentials) {
        joinServerRequest(onJoinServerResponse)
      } else {
        if (packet.serverId !== '-') {
          debug('This server appears to be an online server and you are providing no password, the authentication will probably fail')
        }
        sendEncryptionKeyResponse()
      }

      function onJoinServerResponse (err) {
        if (err) {
          client.emit('error', err)
          client.end()
        } else {
          sendEncryptionKeyResponse()
        }
      }

      function joinServerRequest (cb) {
        yggserver.join(options.accessToken, client.session.selectedProfile.id,
          packet.serverId, sharedSecret, packet.publicKey, cb)
      }

      function sendEncryptionKeyResponse () {
        const pubKey = mcPubKeyToPem(packet.publicKey)
        const encryptedSharedSecretBuffer = crypto.publicEncrypt({ key: pubKey, padding: crypto.constants.RSA_PKCS1_PADDING }, sharedSecret)
        const encryptedVerifyTokenBuffer = crypto.publicEncrypt({ key: pubKey, padding: crypto.constants.RSA_PKCS1_PADDING }, packet.verifyToken)
        client.write('encryption_begin', {
          sharedSecret: encryptedSharedSecretBuffer,
          verifyToken: encryptedVerifyTokenBuffer
        })
        client.setEncryption(sharedSecret)
      }
    }
  }
}

function mcPubKeyToPem (mcPubKeyBuffer) {
  let pem = '-----BEGIN PUBLIC KEY-----\n'
  let base64PubKey = mcPubKeyBuffer.toString('base64')
  const maxLineLength = 65
  while (base64PubKey.length > 0) {
    pem += base64PubKey.substring(0, maxLineLength) + '\n'
    base64PubKey = base64PubKey.substring(maxLineLength)
  }
  pem += '-----END PUBLIC KEY-----\n'
  return pem
}
