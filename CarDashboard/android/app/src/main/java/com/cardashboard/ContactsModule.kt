package com.cardashboard

import android.provider.ContactsContract
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableNativeArray
import com.facebook.react.bridge.WritableNativeMap

class ContactsModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "ContactsModule"

    @ReactMethod
    fun getContacts(promise: Promise) {
        try {
            val contacts = WritableNativeArray()

            // Consultar todos los contactos con número de teléfono
            val cursor = reactApplicationContext.contentResolver.query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                arrayOf(
                    ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                    ContactsContract.CommonDataKinds.Phone.NUMBER
                ),
                null, null,
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC"
            )

            cursor?.use {
                val nameIdx = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
                val phoneIdx = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)

                val seen = mutableSetOf<String>() // Evitar duplicados

                while (it.moveToNext()) {
                    val name = it.getString(nameIdx) ?: continue
                    val phone = it.getString(phoneIdx) ?: continue
                    val key = name + phone

                    if (!seen.contains(key)) {
                        seen.add(key)
                        val contact = WritableNativeMap()
                        contact.putString("name", name)
                        contact.putString("phone", phone)
                        contacts.pushMap(contact)
                    }
                }
            }

            promise.resolve(contacts)
        } catch (e: Exception) {
            promise.reject("CONTACTS_ERROR", e.message ?: "Error al leer contactos")
        }
    }

    @ReactMethod
    fun getOwnerName(promise: Promise) {
        try {
            var ownerName: String? = null
            val resolver = reactApplicationContext.contentResolver
            
            // Intento 1: Perfil de contactos
            val cursor = resolver.query(
                android.provider.ContactsContract.Profile.CONTENT_URI,
                arrayOf(android.provider.ContactsContract.Profile.DISPLAY_NAME),
                null, null, null
            )
            cursor?.use {
                if (it.moveToFirst()) {
                    val nameIdx = it.getColumnIndex(android.provider.ContactsContract.Profile.DISPLAY_NAME)
                    if (nameIdx != -1) {
                        val name = it.getString(nameIdx)
                        if (!name.isNullOrBlank()) {
                            ownerName = name.split(" ")[0]
                        }
                    }
                }
            }
            
            // Intento 2: Nombre del dispositivo (Bluetooth / System Name)
            if (ownerName.isNullOrBlank()) {
                ownerName = android.provider.Settings.Global.getString(resolver, android.provider.Settings.Global.DEVICE_NAME)
            }
            if (ownerName.isNullOrBlank()) {
                ownerName = android.provider.Settings.Secure.getString(resolver, "bluetooth_name")
            }

            // Intento 3: Modelo del dispositivo
            if (ownerName.isNullOrBlank()) {
                ownerName = android.os.Build.MODEL
            }

            promise.resolve(ownerName ?: "Conductor")
        } catch (e: Exception) {
            promise.resolve(android.os.Build.MODEL ?: "Conductor")
        }
    }

    @ReactMethod
    fun makeDirectCall(number: String) {
        val activity = reactApplicationContext.currentActivity ?: return
        try {
            val intent = android.content.Intent(android.content.Intent.ACTION_CALL).apply {
                data = android.net.Uri.parse("tel:$number")
                flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK
            }
            activity.startActivity(intent)
        } catch (e: Exception) {
            val dialIntent = android.content.Intent(android.content.Intent.ACTION_DIAL).apply {
                data = android.net.Uri.parse("tel:$number")
                flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK
            }
            activity.startActivity(dialIntent)
        }
    }
}
