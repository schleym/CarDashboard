package com.cardashboard

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.bluetooth.BluetoothDevice
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

class BluetoothReceiver : BroadcastReceiver() {
    companion object {
        const val CHANNEL_ID = "carnova_bt_channel"
        const val NOTIFICATION_ID = 1
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (BluetoothDevice.ACTION_ACL_CONNECTED == intent.action) {
            Log.d("CarNova", "Bluetooth conectado. Lanzando CarNova...")
            createNotificationChannel(context)
            showFullScreenNotification(context)
        }
    }

    private fun createNotificationChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "CarNova - Modo Auto",
                // IMPORTANCE_HIGH es clave para que aparezca sobre la pantalla de bloqueo
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notificación automática al conectar Bluetooth"
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    private fun showFullScreenNotification(context: Context) {
        val launchIntent = Intent(context, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }

        // PendingIntent: lo que ocurre si el usuario toca la notificación
        val pendingIntent = PendingIntent.getActivity(
            context, 0, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentTitle("🚗 CarNova Activado")
                .setContentText("Radio conectada. Toca para abrir el Dashboard.")
                .setContentIntent(pendingIntent)
                // fullScreenIntent: es lo que hace que aparezca sobre la pantalla de bloqueo
                .setFullScreenIntent(pendingIntent, true)
                .setAutoCancel(true)
                .build()
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(context)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentTitle("🚗 CarNova Activado")
                .setContentText("Radio conectada. Toca para abrir el Dashboard.")
                .setContentIntent(pendingIntent)
                .setFullScreenIntent(pendingIntent, true)
                .setAutoCancel(true)
                .build()
        }

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIFICATION_ID, notification)
    }
}
