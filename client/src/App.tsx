/* eslint-disable react/no-unstable-nested-components */
/* eslint-disable react-native/no-inline-styles */
import React, {useEffect, useState, useRef} from 'react';
import {
  Platform,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  View,
  Text,
  TouchableOpacity,
} from 'react-native';
import TextInputContainer from './components/TextInputContainer';
import SocketIOClient from 'socket.io-client';
import {
  mediaDevices,
  RTCPeerConnection,
  RTCView,
  RTCIceCandidate,
  RTCSessionDescription,
  MediaStream,
} from 'react-native-webrtc';
import CallEnd from './asset/CallEnd';
import CallAnswer from './asset/CallAnswer';
import MicOn from './asset/MicOn';
import MicOff from './asset/MicOff';
import VideoOn from './asset/VideoOn';
import VideoOff from './asset/VideoOff';
import CameraSwitch from './asset/CameraSwitch';
import IconContainer from './components/IconContainer';
import InCallManager from 'react-native-incall-manager';

export default function App(): JSX.Element {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [type, setType] = useState<
    'JOIN' | 'INCOMING_CALL' | 'OUTGOING_CALL' | 'WEBRTC_ROOM'
  >('JOIN');
  const [callerId] = useState(
    Math.floor(100000 + Math.random() * 900000).toString(),
  );
  const otherUserId = useRef<string | null>(null);

  const socket = SocketIOClient('http://localhost:5150', {
    transports: ['websocket'],
    query: {
      callerId,
    },
  });

  const [localMicOn, setLocalMicOn] = useState(true);
  const [localWebcamOn, setLocalWebcamOn] = useState(true);

  const peerConnection = useRef<any>(
    new RTCPeerConnection({
      iceServers: [
        {
          urls: 'stun:stun.l.google.com:19302',
        },
        {
          urls: 'stun:stun1.l.google.com:19302',
        },
        {
          urls: 'stun:stun2.l.google.com:19302',
        },
      ],
    }),
  );

  let remoteRTCMessage = useRef<RTCSessionDescription | any>(null);

  useEffect(() => {
    socket.on('newCall', data => {
      remoteRTCMessage.current = data.rtcMessage;
      otherUserId.current = data.callerId;
      setType('INCOMING_CALL');
    });

    socket.on('callAnswered', data => {
      remoteRTCMessage.current = data.rtcMessage;
      peerConnection.current.setRemoteDescription(
        new RTCSessionDescription(remoteRTCMessage.current),
      );
      setType('WEBRTC_ROOM');
    });

    socket.on('ICEcandidate', data => {
      let message = data.rtcMessage;

      if (peerConnection.current) {
        peerConnection?.current
          .addIceCandidate(
            new RTCIceCandidate({
              candidate: message.candidate,
              sdpMid: message.id,
              sdpMLineIndex: message.label,
            }),
          )
          .then((data: any) => {
            console.log('SUCCESS', data);
          })
          .catch((err: any) => {
            console.log('Error', err);
          });
      }
    });

    let isFront = false;

    mediaDevices.enumerateDevices().then((sourceInfos: any) => {
      let videoSourceId;
      for (let i = 0; i < sourceInfos.length; i++) {
        const sourceInfo = sourceInfos[i];
        if (
          sourceInfo.kind == 'videoinput' &&
          sourceInfo.facing == (isFront ? 'user' : 'environment')
        ) {
          videoSourceId = sourceInfo.deviceId;
        }
      }

      mediaDevices
        .getUserMedia({
          audio: true,
          video: {
            mandatory: {
              minWidth: 500, // Provide your own width, height and frame rate here
              minHeight: 300,
              minFrameRate: 30,
            },
            facingMode: isFront ? 'user' : 'environment',
            optional: videoSourceId ? [{sourceId: videoSourceId}] : [],
          },
        })
        .then(stream => {
          // Got stream!
          setLocalStream(stream);

          // setup stream listening
          peerConnection.current.addStream(stream);
        })
        .catch(() => {
          // Log error
        });
    });

    peerConnection.current.onaddstream = (event: any) => {
      setRemoteStream(event.stream);
    };

    // Setup ice handling
    peerConnection.current.onicecandidate = (event: any) => {
      if (event.candidate) {
        const rtcIceCandidate = new RTCIceCandidate({
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
        });

        sendICEcandidate({
          calleeId: otherUserId.current,
          rtcMessage: rtcIceCandidate,
        });
      } else {
        console.log('End of candidates.');
      }
    };

    return () => {
      socket.off('newCall');
      socket.off('callAnswered');
      socket.off('ICEcandidate');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    InCallManager.start();
    InCallManager.setKeepScreenOn(true);
    InCallManager.setForceSpeakerphoneOn(true);

    return () => {
      InCallManager.stop();
    };
  }, []);

  function sendICEcandidate(data: {
    calleeId: string | null;
    rtcMessage: RTCIceCandidate;
  }): void {
    socket.emit('ICEcandidate', data);
  }

  async function processCall(): Promise<void> {
    const sessionDescription = await peerConnection.current.createOffer(null);
    await peerConnection.current.setLocalDescription(
      sessionDescription as RTCSessionDescription,
    );
    sendCall({
      calleeId: otherUserId.current,
      rtcMessage: sessionDescription as RTCSessionDescription,
    });
  }

  async function processAccept(): Promise<void> {
    peerConnection.current.setRemoteDescription(
      new RTCSessionDescription(remoteRTCMessage.current),
    );
    const sessionDescription = await peerConnection.current.createAnswer();
    await peerConnection.current.setLocalDescription(
      sessionDescription as RTCSessionDescription,
    );
    answerCall({
      callerId: otherUserId.current,
      rtcMessage: sessionDescription as RTCSessionDescription,
    });
  }

  function answerCall(data: {
    callerId: string | null;
    rtcMessage: RTCSessionDescription;
  }): void {
    socket.emit('answerCall', data);
  }

  function sendCall(data: {
    calleeId: string | null;
    rtcMessage: RTCSessionDescription | any;
  }): void {
    socket.emit('call', data);
  }

  function switchCamera(): void {
    localStream?.getVideoTracks().forEach(track => {
      track._switchCamera();
    });
  }

  function toggleCamera(): void {
    setLocalWebcamOn(prevState => !prevState);
    localStream?.getVideoTracks().forEach(track => {
      localWebcamOn ? (track.enabled = false) : (track.enabled = true);
    });
  }

  function toggleMic(): void {
    setLocalMicOn(prevState => !prevState);
    localStream?.getAudioTracks().forEach(track => {
      localMicOn ? (track.enabled = false) : (track.enabled = true);
    });
  }

  function leave(): void {
    peerConnection.current.close();
    setLocalStream(null);
    setType('JOIN');
  }

  const JoinScreen = (): JSX.Element => {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{
          flex: 1,
          backgroundColor: '#050A0E',
          justifyContent: 'center',
          paddingHorizontal: 42,
        }}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <>
            <View
              style={{
                padding: 35,
                backgroundColor: '#1A1C22',
                justifyContent: 'center',
                alignItems: 'center',
                borderRadius: 14,
              }}>
              <Text
                style={{
                  fontSize: 18,
                  color: '#D0D4DD',
                }}>
                Your Caller ID
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  marginTop: 12,
                  alignItems: 'center',
                }}>
                <Text
                  style={{
                    fontSize: 32,
                    color: '#ffff',
                    letterSpacing: 6,
                  }}>
                  {callerId}
                </Text>
              </View>
            </View>

            <View
              style={{
                backgroundColor: '#1A1C22',
                padding: 40,
                marginTop: 25,
                justifyContent: 'center',
                borderRadius: 14,
              }}>
              <Text
                style={{
                  fontSize: 18,
                  color: '#D0D4DD',
                }}>
                Enter call id of another user
              </Text>
              <TextInputContainer
                placeholder={'Enter Caller ID'}
                value={otherUserId.current}
                setValue={text => {
                  otherUserId.current = text;
                  console.log('TEST', otherUserId.current);
                }}
                keyboardType={'number-pad'}
              />
              <TouchableOpacity
                onPress={() => {
                  setType('OUTGOING_CALL');
                  processCall();
                }}
                style={{
                  height: 50,
                  backgroundColor: '#5568FE',
                  justifyContent: 'center',
                  alignItems: 'center',
                  borderRadius: 12,
                  marginTop: 16,
                }}>
                <Text
                  style={{
                    fontSize: 16,
                    color: '#FFFFFF',
                  }}>
                  Call Now
                </Text>
              </TouchableOpacity>
            </View>
          </>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    );
  };

  const OutgoingCallScreen = (): JSX.Element => {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'space-around',
          backgroundColor: '#050A0E',
        }}>
        <View
          style={{
            padding: 35,
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: 14,
          }}>
          <Text
            style={{
              fontSize: 16,
              color: '#D0D4DD',
            }}>
            Calling to...
          </Text>

          <Text
            style={{
              fontSize: 36,
              marginTop: 12,
              color: '#ffff',
              letterSpacing: 6,
            }}>
            {otherUserId.current}
          </Text>
        </View>
        <View
          style={{
            justifyContent: 'center',
            alignItems: 'center',
          }}>
          <TouchableOpacity
            onPress={() => {
              setType('JOIN');
              otherUserId.current = null;
            }}
            style={{
              backgroundColor: '#FF5D5D',
              borderRadius: 30,
              height: 60,
              aspectRatio: 1,
              justifyContent: 'center',
              alignItems: 'center',
            }}>
            <CallEnd width={50} height={12} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const IncomingCallScreen = (): JSX.Element => {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'space-around',
          backgroundColor: '#050A0E',
        }}>
        <View
          style={{
            padding: 35,
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: 14,
          }}>
          <Text
            style={{
              fontSize: 36,
              marginTop: 12,
              color: '#ffff',
            }}>
            {otherUserId.current} is calling..
          </Text>
        </View>
        <View
          style={{
            justifyContent: 'center',
            alignItems: 'center',
          }}>
          <TouchableOpacity
            onPress={() => {
              processAccept();
              setType('WEBRTC_ROOM');
            }}
            style={{
              backgroundColor: 'green',
              borderRadius: 30,
              height: 60,
              aspectRatio: 1,
              justifyContent: 'center',
              alignItems: 'center',
            }}>
            <CallAnswer height={28} fill={'#fff'} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const WebrtcRoomScreen = (): JSX.Element => {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#050A0E',
          paddingHorizontal: 12,
          paddingVertical: 12,
        }}>
        {localStream ? (
          <RTCView
            objectFit={'cover'}
            style={{flex: 1, backgroundColor: '#050A0E'}}
            streamURL={localStream.toURL()}
          />
        ) : null}
        {remoteStream ? (
          <RTCView
            objectFit="cover"
            style={{
              flex: 1,
              backgroundColor: '#050A0E',
              marginTop: 8,
            }}
            streamURL={remoteStream?.toURL()}
          />
        ) : null}
        <View
          style={{
            marginVertical: 12,
            flexDirection: 'row',
            justifyContent: 'space-evenly',
          }}>
          <IconContainer
            backgroundColor={'red'}
            onPress={() => {
              leave();
            }}
            Icon={<CallEnd height={26} width={26} fill="#FFF" />}
          />
          <IconContainer
            style={{
              borderWidth: 1.5,
              borderColor: '#2B3034',
            }}
            backgroundColor={!localMicOn ? '#fff' : 'transparent'}
            onPress={() => {
              toggleMic();
            }}
            Icon={
              localMicOn ? (
                <MicOn height={24} width={24} fill="#FFF" />
              ) : (
                <MicOff height={28} width={28} fill="#1D2939" />
              )
            }
          />
          <IconContainer
            style={{
              borderWidth: 1.5,
              borderColor: '#2B3034',
            }}
            backgroundColor={!localWebcamOn ? '#fff' : 'transparent'}
            onPress={() => {
              toggleCamera();
            }}
            Icon={
              localWebcamOn ? (
                <VideoOn height={24} width={24} fill="#FFF" />
              ) : (
                <VideoOff height={36} width={36} fill="#1D2939" />
              )
            }
          />
          <IconContainer
            style={{
              borderWidth: 1.5,
              borderColor: '#2B3034',
            }}
            backgroundColor={'transparent'}
            onPress={() => {
              switchCamera();
            }}
            Icon={<CameraSwitch height={24} width={24} fill="#FFF" />}
          />
        </View>
      </View>
    );
  };

  switch (type) {
    case 'JOIN':
      return JoinScreen();
    case 'INCOMING_CALL':
      return IncomingCallScreen();
    case 'OUTGOING_CALL':
      return OutgoingCallScreen();
    case 'WEBRTC_ROOM':
      return WebrtcRoomScreen();
    default:
      return <></>;
  }
}
