import React, { useEffect, useState, useRef } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  Linking,
  StyleSheet,
  NativeModules,
  NativeEventEmitter,
  StatusBar,
  Animated,
  PermissionsAndroid,
  Platform,
  Alert,
  Image,
  ScrollView,
  useWindowDimensions,
  Modal,
} from 'react-native';

const { MediaController, VoiceRecognizer, ContactsModule, TTSModule } = NativeModules;

// Habla en voz alta usando el TTS nativo
const speak = (text: string) => TTSModule?.speak(text);

const KEYCODE_MEDIA_PLAY_PAUSE = 85;
const KEYCODE_MEDIA_NEXT = 87;
const KEYCODE_MEDIA_PREVIOUS = 88;

// Tipo de contacto
type Contact = { name: string; phone: string };

// ===== BÚSQUEDA INTELIGENTE DE CONTACTOS =====
const findContact = (contacts: Contact[], spokenName: string): Contact | null => {
  const query = spokenName.toLowerCase().trim();
  if (!query) return null;
  
  // 1. Búsqueda exacta primero
  let match = contacts.find(c => c.name.toLowerCase().trim() === query);
  if (match) return match;
  
  // 2. Búsqueda por palabra completa o subcadena inteligente
  match = contacts.find(c => {
    const name = c.name.toLowerCase().trim();
    if (name.length < 3) {
      // Si el nombre en contactos es muy corto (ej: "A", "Yo"), exigir coincidencia exacta
      return name === query;
    }
    
    // Si la consulta contiene el nombre del contacto como palabra completa (ej: query="hermano juan", name="juan")
    const queryWords = query.split(/\s+/);
    if (queryWords.includes(name)) return true;
    
    // Si el nombre del contacto contiene la consulta completa (ej: query="juan", name="juan carlos")
    if (name.includes(query)) return true;
    
    return false;
  });
  if (match) return match;

  // 3. Fallback: búsqueda por palabras individuales significativas
  const ignoreWords = ['mi', 'de', 'la', 'el', 'los', 'las', 'a', 'o', 'y', 'con', 'para', 'hermano', 'mama', 'papa', 'tio', 'tia', 'amor'];
  const queryWords = query.split(/\s+/).filter(w => w.length > 2 && !ignoreWords.includes(w));
  
  if (queryWords.length > 0) {
    match = contacts.find(c => {
      const nameWords = c.name.toLowerCase().split(/\s+/);
      return queryWords.some(qw => nameWords.includes(qw));
    });
  }
  
  return match || null;
};

// ===== MOTOR DE COMANDOS DE VOZ =====
const processVoiceCommand = async (
  text: string,
  contacts: Contact[]
): Promise<string> => {
  const cmd = text.toLowerCase().trim();

  // LLAMADAS DINÁMICAS POR NOMBRE DE CONTACTO
  const callPhrases = ['llamar a ', 'llama a ', 'llamar ', 'llama '];
  for (const phrase of callPhrases) {
    if (cmd.startsWith(phrase)) {
      const spokenName = cmd.replace(phrase, '').trim();
      const contact = findContact(contacts, spokenName);
      if (contact) {
        ContactsModule?.makeDirectCall(contact.phone);
        return `Llamando a ${contact.name}`;
      } else {
        return `No encontré a ${spokenName} en tus contactos.`;
      }
    }
  }

  // NAVEGACIÓN
  if (cmd.includes('maps') || cmd.includes('mapa') || cmd.includes('navegar') || cmd.includes('gps')) {
    await Linking.openURL('google.navigation:q=');
    return 'Abriendo Google Maps';
  }
  if (cmd.includes('waze') || cmd.includes('guía') || cmd.includes('ruta')) {
    await Linking.openURL('waze://');
    return 'Abriendo Waze';
  }

  // MÚSICA
  if (cmd.includes('spotify') || cmd.includes('espotifi')) {
    await Linking.openURL('spotify://');
    return 'Abriendo Spotify';
  }
  if (cmd.includes('youtube music') || cmd.includes('yt music') || cmd.includes('music')) {
    try { await Linking.openURL('https://music.youtube.com'); } catch (e) {}
    return 'Abriendo YouTube Music';
  }
  if (cmd.includes('youtube') || cmd.includes('videos')) {
    try { await Linking.openURL('vnd.youtube://'); } catch (e) { await Linking.openURL('https://www.youtube.com'); }
    return 'Abriendo YouTube';
  }
  if (cmd.includes('play') || cmd.includes('reproducir') || cmd.includes('música')) {
    MediaController?.sendMediaKey(KEYCODE_MEDIA_PLAY_PAUSE);
    return 'Reproduciendo música';
  }
  if (cmd.includes('pausa') || cmd.includes('pausar') || cmd.includes('stop')) {
    MediaController?.sendMediaKey(KEYCODE_MEDIA_PLAY_PAUSE);
    return 'Música pausada';
  }
  if (cmd.includes('siguiente') || cmd.includes('próxima')) {
    MediaController?.sendMediaKey(KEYCODE_MEDIA_NEXT);
    return 'Siguiente canción';
  }
  if (cmd.includes('anterior') || cmd.includes('atrás') || cmd.includes('regresa')) {
    MediaController?.sendMediaKey(KEYCODE_MEDIA_PREVIOUS);
    return 'Canción anterior';
  }

  // VOLUMEN Y AUDIO
  if (cmd.includes('subir volumen') || cmd.includes('sube el volumen') || cmd.includes('sube volumen') || cmd.includes('aumentar volumen') || cmd.includes('más volumen') || cmd.includes('mas volumen')) {
    MediaController?.volumeUp();
    return 'Subiendo volumen';
  }
  if (cmd.includes('bajar volumen') || cmd.includes('baja el volumen') || cmd.includes('baja volumen') || cmd.includes('disminuir volumen') || cmd.includes('menos volumen')) {
    MediaController?.volumeDown();
    return 'Bajando volumen';
  }
  if (cmd.includes('silencio') || cmd.includes('silenciar') || cmd.includes('mute') || cmd.includes('mutear')) {
    MediaController?.setVolume(0);
    return 'Audio silenciado';
  }

  // Si no reconoció ningún comando
  return `No entendí el comando: ${text}`;
};

const App = () => {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const [time, setTime] = useState('');
  const [date, setDate] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isHandsFree, setIsHandsFree] = useState(false); // Manual por defecto
  const [voiceText, setVoiceText] = useState('Toca el micrófono para hablar');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [voiceState, setVoiceState] = useState<'STANDBY' | 'COMMAND'>('STANDBY');
  const [userName, setUserName] = useState('Conductor');
  const [showHelp, setShowHelp] = useState(false);
  
  const contactsRef = useRef<Contact[]>([]);
  const handsFreeRef = useRef(false); // Manual por defecto
  const voiceStateRef = useRef<'STANDBY' | 'COMMAND'>('STANDBY');
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const micAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }).start();

    // Escuchar eventos del módulo nativo de voz
    const emitter = new NativeEventEmitter(VoiceRecognizer);
    const resultSub = emitter.addListener('onVoiceResult', async (text: string) => {
      setIsListening(false);
      
      if (!text) {
        if (handsFreeRef.current) {
          setIsListening(true);
          VoiceRecognizer?.startListening();
        }
        return;
      }

      const recognizedText = text.toLowerCase().trim();

      if (voiceStateRef.current === 'STANDBY') {
        // Modo Espera Activa: reacciona solo a la palabra clave "nova"
        if (recognizedText.includes('nova')) {
          speak('Dime');
          setVoiceText('Te escucho... di tu comando');
          voiceStateRef.current = 'COMMAND';
          setVoiceState('COMMAND');
          
          // Esperar un momento a que termine el TTS y abrir el micrófono
          setTimeout(() => {
            setIsListening(true);
            VoiceRecognizer?.startListening();
          }, 1200);
        } else {
          // Si no es el wake-word, esperamos un tiempo largo antes de volver a escuchar
          // para NO interrumpir la música constantemente
          if (handsFreeRef.current) {
            setTimeout(() => {
              if (handsFreeRef.current && voiceStateRef.current === 'STANDBY') {
                setIsListening(true);
                VoiceRecognizer?.startListening();
              }
            }, 8000); // 8 segundos de pausa entre intentos de escucha
          }
        }
      } else {
        // Modo Comando Activo: ejecuta la orden real
        const response = await processVoiceCommand(text, contactsRef.current);
        setVoiceText(response);
        speak(response);

        // Volver a modo standby automáticamente
        voiceStateRef.current = 'STANDBY';
        setVoiceState('STANDBY');

        if (handsFreeRef.current) {
          setTimeout(() => {
            setVoiceText("Di 'Nova' para activar");
            setIsListening(true);
            VoiceRecognizer?.startListening();
          }, 4500);
        } else {
          setTimeout(() => setVoiceText('Toca el micrófono y habla'), 5000);
        }
      }
    });
    const partialSub = emitter.addListener('onVoicePartial', (text: string) => {
      if (voiceStateRef.current === 'COMMAND' && text) {
        setVoiceText(`👂 "${text}"`);
      }
    });
    const startSub = emitter.addListener('onVoiceStart', () => {
      if (voiceStateRef.current === 'COMMAND') {
        setVoiceText('Te escucho...');
      } else {
        setVoiceText("Di 'Nova' para activar");
      }
    });
    const errorSub = emitter.addListener('onVoiceError', () => {
      setIsListening(false);
      
      if (handsFreeRef.current) {
        // Si falló escuchando la orden, regresa a standby
        voiceStateRef.current = 'STANDBY';
        setVoiceState('STANDBY');
        setVoiceText("Di 'Nova' para activar");
        
        setTimeout(() => {
          if (handsFreeRef.current && voiceStateRef.current === 'STANDBY') {
            setIsListening(true);
            VoiceRecognizer?.startListening();
          }
        }, 12000); // 12 segundos de pausa después de un error para no molestar
      } else {
        const msg = 'No te escuché. ¿Puedes repetirlo?';
        setVoiceText(msg);
        speak(msg);
        setTimeout(() => setVoiceText('Toca el micrófono y habla'), 4000);
      }
    });

    return () => {
      resultSub.remove(); partialSub.remove();
      startSub.remove(); errorSub.remove();
    };
  }, []);

  // Animación del micrófono al escuchar
  useEffect(() => {
    if (voiceState === 'COMMAND') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(micAnim, { toValue: 1.2, duration: 500, useNativeDriver: true }),
          Animated.timing(micAnim, { toValue: 1.0, duration: 500, useNativeDriver: true }),
        ])
      ).start();
    } else {
      micAnim.stopAnimation();
      micAnim.setValue(1);
    }
  }, [voiceState]);

  // Animación del botón play
  useEffect(() => {
    if (isPlaying) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.1, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isPlaying]);

  useEffect(() => {
    const requestPermissions = async () => {
      if (Platform.OS === 'android') {
        const perms: (keyof typeof PermissionsAndroid.PERMISSIONS)[] = [
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        ] as any;
        if (Platform.Version >= 33) perms.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS as any);
        if (Platform.Version >= 31) perms.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT as any);

        // Permisos de contactos y llamadas
        perms.push(PermissionsAndroid.PERMISSIONS.READ_CONTACTS as any);
        perms.push(PermissionsAndroid.PERMISSIONS.CALL_PHONE as any);

        const results = await PermissionsAndroid.requestMultiple(perms as any);
        const contactsGranted =
          results[PermissionsAndroid.PERMISSIONS.READ_CONTACTS] === PermissionsAndroid.RESULTS.GRANTED;

        if (contactsGranted) {
          try {
            const loadedContacts = await ContactsModule.getContacts();
            setContacts(loadedContacts);
            contactsRef.current = loadedContacts; // ← Sincronizar el ref para los listeners
            console.log(`CarNova: ${loadedContacts.length} contactos cargados.`);
            
            // Obtener el nombre del perfil del propietario
            try {
              const name = await ContactsModule.getOwnerName();
              setUserName(name || 'Conductor');
            } catch (err) {
              console.warn('CarNova: No se pudo obtener el nombre del propietario.', err);
            }
            
            if (handsFreeRef.current) {
              setIsListening(true);
              VoiceRecognizer?.startListening();
            }
          } catch (e) {
            console.warn('CarNova: No se pudieron cargar los contactos.', e);
          }
        }
      }
    };
    requestPermissions();

    const updateClock = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      setDate(now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }));
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  const toggleHandsFree = () => {
    const nextVal = !isHandsFree;
    setIsHandsFree(nextVal);
    handsFreeRef.current = nextVal;
    
    // Al desactivar o activar forzamos retorno a STANDBY
    voiceStateRef.current = 'STANDBY';
    setVoiceState('STANDBY');
    
    if (nextVal) {
      setIsListening(true);
      setVoiceText("Di 'Nova' para activar");
      VoiceRecognizer?.startListening();
    } else {
      VoiceRecognizer?.stopListening();
      setIsListening(false);
      setVoiceText('Modo Manual: Toca el micro para hablar');
    }
  };

  const handleMic = () => {
    // Al presionar el micrófono, forzamos a escuchar el comando directamente
    voiceStateRef.current = 'COMMAND';
    setVoiceState('COMMAND');
    setVoiceText('Te escucho...');
    setIsListening(true);
    VoiceRecognizer?.startListening();
  };

  const openGoogleMaps = async () => {
    try { await Linking.openURL('google.navigation:q='); } catch (e) { }
  };
  const openWaze = async () => {
    try { await Linking.openURL('waze://'); } catch (e) { Linking.openURL('market://details?id=com.waze'); }
  };
  const openSpotify = async () => {
    try { await Linking.openURL('spotify://'); } catch (e) { Linking.openURL('market://details?id=com.spotify.music'); }
  };
  const openYTMusic = async () => {
    try { await Linking.openURL('https://music.youtube.com'); } catch (e) { Linking.openURL('market://details?id=com.google.android.apps.youtube.music'); }
  };
  const openYouTube = async () => {
    // Abrir YouTube normal
    try { await Linking.openURL('vnd.youtube://'); }
    catch (e) { Linking.openURL('market://details?id=com.google.android.youtube'); }
  };

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
    MediaController?.sendMediaKey(KEYCODE_MEDIA_PLAY_PAUSE);
  };
  const nextTrack = () => MediaController?.sendMediaKey(KEYCODE_MEDIA_NEXT);
  const prevTrack = () => MediaController?.sendMediaKey(KEYCODE_MEDIA_PREVIOUS);
  const increaseVolume = () => MediaController?.volumeUp();
  const decreaseVolume = () => MediaController?.volumeDown();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar hidden />
      <Animated.View style={[styles.inner, { opacity: fadeAnim, paddingTop: isLandscape ? 10 : 48 }]}>

        {/* MODAL DE COMANDOS DE VOZ */}
        <Modal visible={showHelp} transparent animationType="fade" onRequestClose={() => setShowHelp(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>🎤 Comandos de Nova</Text>
              <Text style={styles.modalSubtitle}>Primero di "Nova" para activar, luego tu comando:</Text>
              <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>

                <Text style={styles.modalCategory}>📞 Llamadas</Text>
                <Text style={styles.modalCmd}>{`"Nova, llamar a [nombre]"`}</Text>
                <Text style={styles.modalCmd}>{`"Nova, llama a mamá"`}</Text>
                <Text style={styles.modalCmd}>{`"Nova, llama a amor"`}</Text>

                <Text style={styles.modalCategory}>🗺️ Navegación</Text>
                <Text style={styles.modalCmd}>{`"Nova, abrir Maps"`}</Text>
                <Text style={styles.modalCmd}>{`"Nova, navegar"`}</Text>
                <Text style={styles.modalCmd}>{`"Nova, abrir GPS"`}</Text>
                <Text style={styles.modalCmd}>{`"Nova, abrir Waze"`}</Text>
                <Text style={styles.modalCmd}>{`"Nova, abrir ruta"`}</Text>

                <Text style={styles.modalCategory}>🎵 Música y Reproducción</Text>
                <Text style={styles.modalCmd}>{`"Nova, abrir Spotify"`}</Text>
                <Text style={styles.modalCmd}>{`"Nova, abrir YouTube Music"`}</Text>
                <Text style={styles.modalCmd}>{`"Nova, abrir YouTube"`}</Text>
                <Text style={styles.modalCmd}>{`"Nova, reproducir"`}</Text>
                <Text style={styles.modalCmd}>{`"Nova, pausar"`}</Text>
                <Text style={styles.modalCmd}>{`"Nova, siguiente"`}</Text>
                <Text style={styles.modalCmd}>{`"Nova, anterior"`}</Text>

                <Text style={styles.modalCategory}>🔊 Control de Volumen</Text>
                <Text style={styles.modalCmd}>{`"Nova, subir volumen"`}</Text>
                <Text style={styles.modalCmd}>{`"Nova, bajar volumen"`}</Text>
                <Text style={styles.modalCmd}>{`"Nova, silencio"`}</Text>

                <Text style={styles.modalCategory}>⚙️ Modos</Text>
                <Text style={styles.modalHint}>🗣️ Manos Libres: Escucha automáticamente</Text>
                <Text style={styles.modalHint}>✋ Manual: Toca el micrófono para hablar</Text>
                <Text style={styles.modalHint}>Toca el botón ✋/🗣️ para cambiar de modo</Text>
              </ScrollView>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowHelp(false)}>
                <Text style={styles.modalCloseTxt}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <ScrollView
          contentContainerStyle={[styles.scrollContent, isLandscape && styles.scrollContentLandscape]}
          showsVerticalScrollIndicator={false}>

          {/* HEADER */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={[styles.userName, isLandscape && styles.textSmall]}>Hola, {userName}</Text>
              {!isLandscape && <Text style={styles.userSubtitle}>{date}</Text>}
            </View>
            <View style={styles.headerRight}>
              <Text style={[styles.weatherText, isLandscape && styles.textSmall]}>☀️ 17°</Text>
              <Text style={styles.statusIcon}>🔵</Text>
              <Text style={styles.statusIcon}>📶</Text>
              <Text style={[styles.clockText, isLandscape && styles.clockSmall]}>{time}</Text>
              <TouchableOpacity style={styles.helpBtn} onPress={() => setShowHelp(true)} activeOpacity={0.7}>
                <Text style={styles.helpBtnText}>?</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ASISTENTE DE VOZ */}
          <View style={[styles.voiceBar, voiceState === 'COMMAND' && styles.voiceBarActive, isLandscape && styles.voiceBarLandscape]}>
            <Animated.View style={{ transform: [{ scale: micAnim }] }}>
              <Pressable
                style={({ pressed }) => [
                  styles.micBtn,
                  voiceState === 'COMMAND' && styles.micBtnActive,
                  isLandscape && styles.micBtnSmall,
                  pressed && { opacity: 0.6 },
                ]}
                onPress={handleMic}
                hitSlop={30}>
                <Text style={[styles.micIcon, isLandscape && { fontSize: 16 }]}>
                  {voiceState === 'COMMAND' ? '🔴' : '🎤'}
                </Text>
              </Pressable>
            </Animated.View>
            <View style={styles.voiceTextBox}>
              <Text style={[styles.voiceTitleText, isLandscape && styles.textSmall]}>{voiceText}</Text>
              <Text style={styles.voiceSubtitleText}>ASISTENTE DE VOZ • {isHandsFree ? 'MANOS LIBRES' : 'MANUAL'}</Text>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.modeToggleBtn,
                isLandscape && styles.modeToggleBtnSmall,
                pressed && { opacity: 0.6 },
              ]}
              onPress={toggleHandsFree}
              hitSlop={25}>
              <Text style={[styles.modeToggleText, isLandscape && { fontSize: 14 }]}>
                {isHandsFree ? '✋' : '🗣️'}
              </Text>
            </Pressable>
          </View>

          {/* LANDSCAPE: fila principal (apps + player lado a lado) */}
          {isLandscape ? (
            <View style={styles.landscapeMain}>
              {/* COLUMNA IZQUIERDA: Grid de Apps */}
              <View style={styles.landscapeApps}>
                {/* Fila 1 */}
                <View style={styles.row}>
                  <TouchableOpacity style={[styles.cardLand, styles.cMaps]} onPress={openGoogleMaps} activeOpacity={0.75}>
                    <View style={styles.circleOverlay} />
                    <Text style={styles.cardEmojiSmall}>🗺️</Text>
                    <Text style={styles.cardTitleSmall}>Maps</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.cardLand, styles.cWaze]} onPress={openWaze} activeOpacity={0.75}>
                    <Text style={styles.cardEmojiSmall}>🧭</Text>
                    <Text style={styles.cardTitleSmall}>Waze</Text>
                  </TouchableOpacity>
                </View>
                {/* Fila 2 */}
                <View style={styles.row}>
                  <TouchableOpacity style={[styles.cardLand, styles.cSpotify]} onPress={openSpotify} activeOpacity={0.75}>
                    <Text style={styles.cardEmojiSmall}>🎵</Text>
                    <Text style={styles.cardTitleSmall}>Spotify</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.cardLand, styles.cYT]} onPress={openYTMusic} activeOpacity={0.75}>
                    <Text style={styles.cardEmojiSmall}>▶️</Text>
                    <Text style={styles.cardTitleSmall}>YT Music</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.cardLand, styles.cYouTube]} onPress={openYouTube} activeOpacity={0.75}>
                    <Text style={styles.cardEmojiSmall}>📺</Text>
                    <Text style={styles.cardTitleSmall}>YouTube</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* COLUMNA DERECHA: Player con Tucson */}
              <View style={styles.landscapePlayer}>
                <Image source={require('./assets/tucson.png')} style={styles.vehicleImageLandscape} />
                <Text style={styles.audioLabel}>AUDIO • BLUETOOTH A2DP</Text>
                <View style={[styles.playerControls, { marginTop: 12 }]}>
                  <Pressable onPress={prevTrack} style={styles.sideBtn} hitSlop={30}>
                    <Text style={styles.playerControlIcon}>⏮</Text>
                  </Pressable>
                  <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                    <Pressable
                      onPress={handlePlayPause}
                      style={({ pressed }) => [styles.playBtn, isPlaying && styles.playActive, pressed && { opacity: 0.7 }]}
                      hitSlop={20}>
                      <Text style={styles.playIcon}>{isPlaying ? '⏸' : '▶'}</Text>
                    </Pressable>
                  </Animated.View>
                  <Pressable onPress={nextTrack} style={styles.sideBtn} hitSlop={30}>
                    <Text style={styles.playerControlIcon}>⏭</Text>
                  </Pressable>
                </View>
                <View style={styles.volumeRow}>
                  <TouchableOpacity onPress={decreaseVolume} style={styles.volBtn} activeOpacity={0.7} hitSlop={15}>
                    <Text style={styles.volBtnText}>🔉 -</Text>
                  </TouchableOpacity>
                  <Text style={styles.volLabel}>VOLUMEN</Text>
                  <TouchableOpacity onPress={increaseVolume} style={styles.volBtn} activeOpacity={0.7} hitSlop={15}>
                    <Text style={styles.volBtnText}>🔊 +</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : (
            /* PORTRAIT: layout vertical original */
            <>
              <View style={styles.gridContainer}>
                <TouchableOpacity style={[styles.cardFull, styles.cMaps]} onPress={openGoogleMaps} activeOpacity={0.75}>
                  <View style={styles.circleOverlay} />
                  <Text style={styles.cardEmoji}>🗺️</Text>
                  <View>
                    <Text style={styles.cardTitle}>Maps</Text>
                    <Text style={styles.cardSubtitle}>Toca para buscar destino</Text>
                  </View>
                </TouchableOpacity>
                <View style={styles.row}>
                  <TouchableOpacity style={[styles.cardHalf, styles.cWaze]} onPress={openWaze} activeOpacity={0.75}>
                    <Text style={styles.cardEmoji}>🧭</Text>
                    <Text style={styles.cardTitle}>Waze</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.cardHalf, styles.cSpotify]} onPress={openSpotify} activeOpacity={0.75}>
                    <Text style={styles.cardEmoji}>🎵</Text>
                    <Text style={styles.cardTitle}>Spotify</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.row}>
                  <TouchableOpacity style={[styles.cardHalf, styles.cYT]} onPress={openYTMusic} activeOpacity={0.75}>
                    <Text style={styles.cardEmoji}>▶️</Text>
                    <Text style={styles.cardTitle}>YT Music</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.cardHalf, styles.cYouTube]} onPress={openYouTube} activeOpacity={0.75}>
                    <Text style={styles.cardEmoji}>📺</Text>
                    <Text style={styles.cardTitle}>YouTube</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.playerContainer}>
                <View style={styles.vehiclePodium}>
                  <Text style={styles.vehicleTitle}>Tucson</Text>
                  <Image source={require('./assets/tucson.png')} style={styles.vehicleImage} />
                  <Text style={styles.audioLabel}>AUDIO • BLUETOOTH A2DP</Text>
                </View>
                <View style={styles.playerControls}>
                  <TouchableOpacity onPress={prevTrack} style={styles.sideBtn}>
                    <Text style={styles.playerControlIcon}>⏮</Text>
                  </TouchableOpacity>
                  <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                    <TouchableOpacity onPress={handlePlayPause} style={[styles.playBtn, isPlaying && styles.playActive]}>
                      <Text style={styles.playIcon}>{isPlaying ? '⏸' : '▶'}</Text>
                    </TouchableOpacity>
                  </Animated.View>
                  <TouchableOpacity onPress={nextTrack} style={styles.sideBtn}>
                    <Text style={styles.playerControlIcon}>⏭</Text>
                  </TouchableOpacity>
                </View>
                <View style={[styles.volumeRow, { marginTop: 14 }]}>
                  <TouchableOpacity onPress={decreaseVolume} style={styles.volBtn} activeOpacity={0.7} hitSlop={15}>
                    <Text style={styles.volBtnText}>🔉 -</Text>
                  </TouchableOpacity>
                  <Text style={styles.volLabel}>VOLUMEN RADIO</Text>
                  <TouchableOpacity onPress={increaseVolume} style={styles.volBtn} activeOpacity={0.7} hitSlop={15}>
                    <Text style={styles.volBtnText}>🔊 +</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0D14' },
  inner: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 24 },
  scrollContentLandscape: { paddingHorizontal: 16, paddingBottom: 12 },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  userName: { color: '#FFFFFF', fontSize: 20, fontWeight: '700', fontFamily: 'sans-serif-medium' },
  userSubtitle: { color: '#687690', fontSize: 12, marginTop: 2, textTransform: 'capitalize' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  weatherText: { color: '#FCD34D', fontSize: 15, fontWeight: '700' },
  statusIcon: { fontSize: 13, color: '#38BDF8' },
  clockText: { color: '#FFFFFF', fontSize: 26, fontWeight: '700', marginLeft: 6, fontFamily: 'sans-serif-medium' },
  clockSmall: { fontSize: 20 },
  textSmall: { fontSize: 14 },

  // Asistente de Voz
  voiceBar: { backgroundColor: '#131824', borderRadius: 28, flexDirection: 'row', alignItems: 'center', padding: 14, marginBottom: 16 },
  voiceBarLandscape: { padding: 10, marginBottom: 12, borderRadius: 20 },
  voiceBarActive: { backgroundColor: '#1A2A44' },
  micBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#1E2536', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  micBtnSmall: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  micBtnActive: { backgroundColor: '#4A1813' },
  micIcon: { fontSize: 22 },
  voiceTextBox: { flex: 1, justifyContent: 'center' },
  voiceTitleText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', fontFamily: 'sans-serif-medium' },
  voiceSubtitleText: { color: '#687690', fontSize: 10, marginTop: 3, letterSpacing: 1 },
  modeToggleBtn: { backgroundColor: '#1E2536', padding: 12, borderRadius: 20, marginLeft: 10, justifyContent: 'center', alignItems: 'center' },
  modeToggleBtnSmall: { padding: 8, borderRadius: 14 },
  modeToggleText: { fontSize: 18 },

  // LANDSCAPE layout
  landscapeMain: { flexDirection: 'row', gap: 14, flex: 1 },
  landscapeApps: { flex: 1.5, gap: 12 },
  landscapePlayer: { flex: 1, backgroundColor: '#111520', borderRadius: 28, alignItems: 'center', justifyContent: 'center', padding: 12 },
  cardLand: { flex: 1, height: 90, borderRadius: 20, padding: 14, justifyContent: 'space-between', overflow: 'hidden' },
  cardEmojiSmall: { fontSize: 22 },
  cardTitleSmall: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', fontFamily: 'sans-serif-medium' },
  vehicleImageLandscape: { width: 180, height: 70, resizeMode: 'contain', marginVertical: 6 },

  // PORTRAIT grid
  gridContainer: { justifyContent: 'space-between', gap: 14, marginBottom: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 14 },
  cardFull: { width: '100%', height: 130, backgroundColor: '#12325E', borderRadius: 28, padding: 20, justifyContent: 'space-between', overflow: 'hidden' },
  circleOverlay: { position: 'absolute', top: -30, right: -30, width: 160, height: 160, borderRadius: 80, backgroundColor: '#174075', opacity: 0.8 },
  cardHalf: { flex: 1, aspectRatio: 1.1, borderRadius: 28, padding: 18, justifyContent: 'space-between' },

  cMaps: { backgroundColor: '#12325E' },
  cWaze: { backgroundColor: '#133824' },
  cSpotify: { backgroundColor: '#103322' },
  cYT: { backgroundColor: '#4A1813' },
  cYouTube: { backgroundColor: '#3A1310' },

  cardEmoji: { fontSize: 30 },
  cardTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', fontFamily: 'sans-serif-medium' },
  cardSubtitle: { color: '#88A8D8', fontSize: 12, marginTop: 4 },

  // Reproductor PORTRAIT
  playerContainer: { backgroundColor: '#111520', borderRadius: 36, paddingBottom: 20, paddingHorizontal: 20, alignItems: 'center', overflow: 'hidden' },
  vehiclePodium: { alignItems: 'center', width: '100%', backgroundColor: '#181E2E', borderBottomLeftRadius: 36, borderBottomRightRadius: 36, paddingTop: 14, paddingBottom: 20, marginBottom: 18 },
  vehicleTitle: { color: '#E2E8F0', fontSize: 14, fontWeight: '700', letterSpacing: 1 },
  vehicleImage: { width: 200, height: 80, resizeMode: 'contain', marginVertical: 6 },
  audioLabel: { color: '#64748B', fontSize: 9, letterSpacing: 2, fontWeight: '700' },

  playerControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28 },
  playBtn: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#1E2536', justifyContent: 'center', alignItems: 'center' },
  playActive: { backgroundColor: '#174075' },
  playIcon: { fontSize: 22, color: '#38BDF8' },
  playerControlIcon: { fontSize: 26, color: '#687690' },
  sideBtn: { padding: 10 },

  // Botón de Ayuda
  helpBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#1E2A44', justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  helpBtnText: { color: '#38BDF8', fontSize: 16, fontWeight: '700' },

  // Modal de Comandos
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalBox: { backgroundColor: '#131824', borderRadius: 32, padding: 28, width: '100%', maxHeight: '85%' },
  modalTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', marginBottom: 6, textAlign: 'center' },
  modalSubtitle: { color: '#687690', fontSize: 13, textAlign: 'center', marginBottom: 20 },
  modalScroll: { maxHeight: 400 },
  modalCategory: { color: '#38BDF8', fontSize: 14, fontWeight: '700', letterSpacing: 1, marginTop: 16, marginBottom: 8, textTransform: 'uppercase' },
  modalCmd: { color: '#E2E8F0', fontSize: 15, backgroundColor: '#1E2536', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 14, marginBottom: 6 },
  modalHint: { color: '#94A3B8', fontSize: 14, marginBottom: 6, paddingLeft: 4 },
  modalCloseBtn: { marginTop: 20, backgroundColor: '#174075', borderRadius: 20, paddingVertical: 14, alignItems: 'center' },
  modalCloseTxt: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },

  // Control de Volumen UI
  volumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#181E2E',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginTop: 10,
  },
  volBtn: {
    backgroundColor: '#1E2536',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A364F',
  },
  volBtnText: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '700',
  },
  volLabel: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
});

export default App;
