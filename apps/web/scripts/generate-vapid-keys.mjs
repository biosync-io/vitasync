import webpush from "web-push"

const vapidKeys = webpush.generateVAPIDKeys()

console.log("VAPID Keys Generated")
console.log("====================")
console.log("")
console.log("Add these to your environment variables:")
console.log("")
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`)
console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`)
console.log("")
console.log("Public key (for client-side push subscription):")
console.log(vapidKeys.publicKey)
console.log("")
console.log("Private key (for server-side push sending — keep secret!):")
console.log(vapidKeys.privateKey)
