document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const recordingStatus = document.getElementById('recordingStatus');
    const recordingsPlayback = document.getElementById('recordingsPlayback');
    const overallScoreContainer = document.getElementById('overallScoreContainer');
    const speechPace = document.getElementById('speechPace');
    const speechFeedback = document.getElementById('speechFeedback');
    const breakFrequency = document.getElementById('breakFrequency');
    const breakFreqFeedback = document.getElementById('breakFreqFeedback');
    const breakDuration = document.getElementById('breakDuration');
    const breakDurFeedback = document.getElementById('breakDurFeedback');
    const fillerBuzz = document.getElementById('fillerBuzz');
    const fillerFeedback = document.getElementById('fillerFeedback');
    
    // Audio analysis variables
    let mediaRecorder;
    let audioContext;
    let analyser;
    let gainNode;
    let speechRecognition;
    let recognitionActive = false;
    let recordings = [];
    let currentRecording = null;
    const fillerDictionary = [
        'um', 'uh', 'like', 'hmm', 'ahh', 'er', 'erm', 'so', 'well',
        'you know', 'i mean', 'actually', 'basically'
    ];

    // Speech recognition setup
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert('Speech Recognition API not supported in this browser. Please use Chrome or Edge.');
        return;
    }

    // Check DOM elements
    if (!startBtn || !stopBtn || !analyzeBtn || !recordingStatus || !recordingsPlayback ||
        !overallScoreContainer || !speechPace || !speechFeedback ||
        !breakFrequency || !breakFreqFeedback || !breakDuration || !breakDurFeedback ||
        !fillerBuzz || !fillerFeedback) {
        const missingElements = [];
        if (!startBtn) missingElements.push('startBtn');
        if (!stopBtn) missingElements.push('stopBtn');
        if (!analyzeBtn) missingElements.push('analyzeBtn');
        if (!recordingStatus) missingElements.push('recordingStatus');
        if (!recordingsPlayback) missingElements.push('recordingsPlayback');
        if (!overallScoreContainer) missingElements.push('overallScoreContainer');
        if (!speechPace) missingElements.push('speechPace');
        if (!speechFeedback) missingElements.push('speechFeedback');
        if (!breakFrequency) missingElements.push('breakFrequency');
        if (!breakFreqFeedback) missingElements.push('breakFreqFeedback');
        if (!breakDuration) missingElements.push('breakDuration');
        if (!breakDurFeedback) missingElements.push('breakDurFeedback');
        if (!fillerBuzz) missingElements.push('fillerBuzz');
        if (!fillerFeedback) missingElements.push('fillerFeedback');
        console.error(`Required DOM elements not found: ${missingElements.join(', ')}`);
        alert(`Application initialization failed. Missing elements: ${missingElements.join(', ')}. Please check the HTML structure.`);
        return;
    }

    // Initialize event listeners
    function initEventListeners() {
        startBtn.addEventListener('click', startRecording);
        stopBtn.addEventListener('click', stopRecording);
        analyzeBtn.addEventListener('click', analyzeRecordings);
    }

    // Start recording
    async function startRecording() {
        console.log('Start recording clicked');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log('Microphone access granted');
            mediaRecorder = new MediaRecorder(stream);
            
            // Setup audio context
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const microphone = audioContext.createMediaStreamSource(stream);
            gainNode = audioContext.createGain();
            gainNode.gain.setValueAtTime(4.0, audioContext.currentTime);
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;
            microphone.connect(gainNode);
            gainNode.connect(analyser);
            
            // Setup speech recognition
            speechRecognition = new SpeechRecognition();
            speechRecognition.continuous = true;
            speechRecognition.interimResults = true;
            speechRecognition.lang = 'en-US';
            
            // Create new recording object
            currentRecording = {
                id: Date.now(),
                audioChunks: [],
                speechData: {
                    speaking: false,
                    speechStartTime: 0,
                    speechSegments: [],
                    breaks: [],
                    fillerWords: [],
                    words: []
                },
                transcript: '',
                startTime: Date.now(),
                endTime: null,
                audioBlob: null,
                audioUrl: null
            };
            
            // Speech recognition handlers
            speechRecognition.onresult = (event) => {
                let interimTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const result = event.results[i];
                    const text = result[0].transcript.toLowerCase();
                    if (result.isFinal) {
                        const words = text.match(/\b\w+\b/g) || [];
                        for (let j = 0; j < words.length; j++) {
                            const word = words[j];
                            currentRecording.speechData.words.push({ word: word });
                            if (fillerDictionary.includes(word)) {
                                currentRecording.speechData.fillerWords.push({ word: word });
                            }
                            if (j < words.length - 1) {
                                const bigram = `${word} ${words[j + 1]}`;
                                if (fillerDictionary.includes(bigram)) {
                                    currentRecording.speechData.fillerWords.push({ word: bigram });
                                    j++;
                                }
                            }
                        }
                        currentRecording.transcript += text + ' ';
                        console.log(`Final transcript: ${text}`);
                    } else {
                        interimTranscript += text + ' ';
                    }
                }
                console.log(`Current transcript: ${currentRecording.transcript + interimTranscript}`);
                updateRecordingsList();
            };

            speechRecognition.onerror = (event) => {
                console.error(`Speech recognition error: ${event.error}`);
                recordingStatus.textContent = `Transcription error: ${event.error}`;
                recordingStatus.style.color = "#e53e3e";
                recognitionActive = false;
                if (event.error !== 'no-speech' && event.error !== 'not-allowed' && mediaRecorder && mediaRecorder.state === 'recording') {
                    setTimeout(() => {
                        if (!recognitionActive) {
                            try {
                                speechRecognition.start();
                                recognitionActive = true;
                                console.log('Speech recognition restarted');
                            } catch (e) {
                                console.error('Failed to restart recognition:', e);
                            }
                        }
                    }, 2000);
                }
            };

            speechRecognition.onend = () => {
                console.log('Speech recognition ended');
                recognitionActive = false;
                if (mediaRecorder && mediaRecorder.state === 'recording' && !recognitionActive) {
                    setTimeout(() => {
                        try {
                            speechRecognition.start();
                            recognitionActive = true;
                            console.log('Speech recognition restarted');
                        } catch (e) {
                            console.error('Failed to restart recognition:', e);
                        }
                    }, 2000);
                }
            };

            // Frequency-based speech detection
            const frequencyData = new Float32Array(analyser.frequencyBinCount);
            const timeDomainData = new Float32Array(analyser.fftSize);
            function analyzeFrequency() {
                analyser.getFloatFrequencyData(frequencyData);
                analyser.getFloatTimeDomainData(timeDomainData);
                const currentTime = Date.now();
                
                // Frequency energy (300-1000 Hz)
                const sampleRate = audioContext.sampleRate;
                const binWidth = sampleRate / analyser.fftSize;
                const startBin = Math.floor(300 / binWidth);
                const endBin = Math.floor(1000 / binWidth);
                let speechEnergy = 0;
                for (let i = startBin; i <= endBin; i++) {
                    speechEnergy += Math.pow(10, frequencyData[i] / 10);
                }
                const avgSpeechEnergy = speechEnergy / (endBin - startBin + 1);
                
                // RMS calculation
                let rms = 0;
                for (let i = 0; i < timeDomainData.length; i++) {
                    rms += timeDomainData[i] * timeDomainData[i];
                }
                rms = Math.sqrt(rms / timeDomainData.length);
                
                // Adjusted threshold for silence
                const isSpeaking = (avgSpeechEnergy > 0.0000005 && rms > 0.001);
                console.log(`Stream ${currentRecording.id}: avgSpeechEnergy=${avgSpeechEnergy.toFixed(8)} Hz, RMS=${rms.toFixed(4)}, isSpeaking=${isSpeaking}`);
                
                const speechData = currentRecording.speechData;
                
                if (isSpeaking !== speechData.speaking) {
                    console.log(`Speaking state changed to ${isSpeaking} at ${currentTime}`);
                    if (isSpeaking) {
                        speechData.speechStartTime = currentTime;
                        if (speechData.speechSegments.length > 0 && 
                            currentTime - speechData.speechSegments[speechData.speechSegments.length - 1].end >= 2000) {
                            speechData.breaks.push({
                                start: speechData.speechSegments[speechData.speechSegments.length - 1].end,
                                end: currentTime,
                                duration: currentTime - speechData.speechSegments[speechData.speechSegments.length - 1].end
                            });
                            console.log(`Break detected: ${JSON.stringify(speechData.breaks[speechData.breaks.length - 1])}`);
                        }
                    } else {
                        const segmentDuration = currentTime - speechData.speechStartTime;
                        if (segmentDuration >= 200) {
                            speechData.speechSegments.push({
                                start: speechData.speechStartTime,
                                end: currentTime,
                                duration: segmentDuration
                            });
                            console.log(`Speech segment added: ${JSON.stringify(speechData.speechSegments[speechData.speechSegments.length - 1])}`);
                        }
                    }
                    speechData.speaking = isSpeaking;
                }
                
                if (mediaRecorder && mediaRecorder.state === 'recording') {
                    requestAnimationFrame(analyzeFrequency);
                }
            }
            
            // Start frequency analysis
            requestAnimationFrame(analyzeFrequency);
            
            // Start speech recognition
            try {
                speechRecognition.start();
                recognitionActive = true;
                recordingStatus.textContent = "Recording and transcribing...";
                console.log('Speech recognition started');
            } catch (e) {
                console.error('Failed to start speech recognition:', e);
                recordingStatus.textContent = "Transcription failed to start";
                recordingStatus.style.color = "#e53e3e";
            }
            
            mediaRecorder.ondataavailable = function(event) {
                currentRecording.audioChunks.push(event.data);
            };
            
            mediaRecorder.onstop = function() {
                try {
                    currentRecording.endTime = Date.now();
                    if (currentRecording.speechData.speaking) {
                        const segmentDuration = currentRecording.endTime - currentRecording.speechData.speechStartTime;
                        if (segmentDuration >= 200) {
                            currentRecording.speechData.speechSegments.push({
                                start: currentRecording.speechData.speechStartTime,
                                end: currentRecording.endTime,
                                duration: segmentDuration
                            });
                            console.log(`Final speech segment added: ${JSON.stringify(currentRecording.speechData.speechSegments[currentRecording.speechData.speechSegments.length - 1])}`);
                        }
                    }
                    currentRecording.audioBlob = new Blob(currentRecording.audioChunks, { type: 'audio/wav' });
                    currentRecording.audioUrl = URL.createObjectURL(currentRecording.audioBlob);
                    
                    recordings.push(currentRecording);
                    updateRecordingsList();
                    analyzeBtn.disabled = false;
                    
                    stream.getTracks().forEach(track => track.stop());
                    if (audioContext && audioContext.state !== 'closed') {
                        audioContext.close();
                    }
                    if (speechRecognition) {
                        speechRecognition.stop();
                        recognitionActive = false;
                    }
                    recordingStatus.textContent = "Recording stopped";
                    recordingStatus.style.color = "#48bb78";
                    console.log('Recording stopped successfully');
                    startBtn.disabled = false;
                    stopBtn.disabled = true;
                } catch (e) {
                    console.error('Error in mediaRecorder.onstop:', e);
                    recordingStatus.textContent = "Error stopping recording";
                    recordingStatus.style.color = "#e53e3e";
                }
            };
            
            mediaRecorder.start(100);
            startBtn.disabled = true;
            stopBtn.disabled = false;
            console.log('Recording started');
        } catch (error) {
            console.error('Error accessing microphone:', error);
            alert('Could not access microphone. Please ensure you have granted microphone permissions.');
            recordingStatus.textContent = "Microphone access denied";
            recordingStatus.style.color = "#e53e3e";
        }
    }

    // Stop recording
    function stopRecording() {
        console.log('Stop recording clicked');
        if (mediaRecorder) {
            console.log(`mediaRecorder state: ${mediaRecorder.state}`);
            if (mediaRecorder.state === 'recording') {
                try {
                    mediaRecorder.stop();
                    console.log('Called mediaRecorder.stop()');
                } catch (e) {
                    console.error('Error stopping mediaRecorder:', e);
                    recordingStatus.textContent = "Error stopping recording";
                    recordingStatus.style.color = "#e53e3e";
                }
            } else {
                console.warn('mediaRecorder is not recording:', mediaRecorder.state);
                recordingStatus.textContent = "Not recording";
                recordingStatus.style.color = "#e53e3e";
            }
        } else {
            console.error('mediaRecorder is undefined');
            recordingStatus.textContent = "No active recording";
            recordingStatus.style.color = "#e53e3e";
        }
    }

    // Analyze recordings
    function analyzeRecordings() {
        console.log('Analyze recordings clicked');
        if (recordings.length === 0) {
            recordingStatus.textContent = "No recordings available";
            recordingStatus.style.color = "#e53e3e";
            return;
        }
        
        // Aggregate all speech data
        const allSpeechSegments = recordings.flatMap(r => r.speechData.speechSegments);
        const allBreaks = recordings.flatMap(r => r.speechData.breaks);
        const allFillers = recordings.flatMap(r => r.speechData.fillerWords);
        const allWords = recordings.flatMap(r => r.speechData.words);
        const allTranscripts = recordings.map(r => r.transcript).join(' ');
        
        console.log(`Aggregated speech segments: ${JSON.stringify(allSpeechSegments)}`);
        
        // Calculate total duration (for gap frequency)
        const totalDuration = recordings.reduce((sum, r) => sum + ((r.endTime - r.startTime) / 1000), 0);
        
        // Check if any meaningful speech was detected
        if (allWords.length === 0 && !allTranscripts.trim()) {
            recordingStatus.textContent = "No speech or transcript detected in recordings";
            updateOverallScore(0, "N/A", "No data to analyze.");
            speechPace.textContent = "";
            speechFeedback.textContent = "No speech detected.";
            breakFrequency.textContent = "";
            breakFreqFeedback.textContent = "No gaps detected.";
            breakDuration.textContent = "";
            breakDurFeedback.textContent = "No gaps detected.";
            fillerBuzz.textContent = "";
            fillerFeedback.textContent = "No filler words detected.";
            recordingStatus.style.color = "#e53e3e";
            return;
        }
        
        // Calculate WPM using speech segments duration
        const words = allTranscripts.match(/\b\w+\b/g) || [];
        console.log(`Detected words: ${words}, Transcript: ${allTranscripts}`);
        const fillerWords = words.filter(word => fillerDictionary.includes(word.toLowerCase()));
        console.log(`Detected fillers: ${fillerWords}`);
        const wordCount = words.length - fillerWords.length;
        const transcriptDuration = allSpeechSegments.reduce((sum, s) => sum + s.duration, 0) / 1000; // Use speech segments
        const wpm = transcriptDuration > 0 ?
            Math.round((wordCount / (transcriptDuration / 60)) * 10) / 10 : 0;
        console.log(`WPM=${wpm}, WordCount=${wordCount}, TranscriptDuration=${transcriptDuration}s`);
        
        // Speech Pace classification and feedback
        let paceCategory = `${wpm} WPM`;
        let speechFeedbackText = "";
        if (wpm < 100) {
            paceCategory += " (Slow)";
            speechFeedbackText = "You speak slower than average. Try to increase your pace slightly.";
        } else if (wpm < 140) {
            paceCategory += " (Average)";
            speechFeedbackText = "Your pace is average. Maintain or slightly improve.";
        } else if (wpm < 180) {
            paceCategory += " (Fast)";
            speechFeedbackText = "You speak quickly. Ensure clarity.";
        } else {
            paceCategory += " (Very Fast)";
            speechFeedbackText = "Your pace is very fast. Slow down for clarity.";
        }
        
        // Filler Buzz
        const fillerCount = allFillers.length;
        let fillerFeedbackText = "";
        if (fillerCount === 0) {
            fillerFeedbackText = "No filler words detected. Excellent!";
        } else if (fillerCount < 5) {
            fillerFeedbackText = "Few filler words. Keep improving.";
        } else if (fillerCount < 10) {
            fillerFeedbackText = "Moderate filler words. Reduce usage.";
        } else {
            fillerFeedbackText = "Too many filler words. They can distract from your message.";
        }
        
        // Speech Gaps
        const gapFreq = totalDuration > 0 && allBreaks.length > 0 ?
            Math.round((allBreaks.length / (totalDuration / 60)) * 10) / 10 : 0;
        let gapFreqFeedbackText = "";
        if (gapFreq === 0) {
            gapFreqFeedbackText = "No gaps detected. Good flow!";
        } else if (gapFreq < 3) {
            gapFreqFeedbackText = "Few gaps. Well-paced.";
        } else if (gapFreq < 5) {
            gapFreqFeedbackText = "Some gaps. Consider reducing.";
        } else {
            gapFreqFeedbackText = "Too many gaps. Try to minimize.";
        }
        
        // Gap Length
        const avgGapDuration = allBreaks.length > 0 ?
            Math.round((allBreaks.reduce((sum, b) => sum + b.duration, 0) / allBreaks.length) / 1000 * 10) / 10 : 0;
        let gapDurFeedbackText = "";
        if (avgGapDuration === 0) {
            gapDurFeedbackText = "No gaps detected. Good flow!";
        } else if (avgGapDuration < 3) {
            gapDurFeedbackText = "Short gaps. Well-managed.";
        } else if (avgGapDuration < 5) {
            gapDurFeedbackText = "Moderate gap length. Consider shortening.";
        } else {
            gapDurFeedbackText = "Long gaps. Try to reduce duration.";
        }
        
        // Communication Skill assessment
        let commScore = 0;
        if (wpm >= 120 && wpm <= 160) commScore += 25;
        else if (wpm >= 100 && wpm < 120 || wpm > 160 && wpm <= 180) commScore += 20;
        else if (wpm > 0) commScore += 15;
        if (fillerCount === 0) commScore += 30;
        else if (fillerCount < 5) commScore += 25;
        else if (fillerCount < 10) commScore += 20;
        else commScore += 10;
        if (gapFreq >= 2 && gapFreq <= 5 && avgGapDuration <= 5) commScore += 20;
        else if (gapFreq > 5 && gapFreq <= 7 && avgGapDuration <= 7) commScore += 15;
        else if (gapFreq > 0) commScore += 10;
        
        // Update overall score dynamically
        updateOverallScore(commScore, getSkillLevel(commScore), getFeedback(commScore));
        
        // Update UI with calculated values
        speechPace.textContent = paceCategory;
        speechFeedback.textContent = speechFeedbackText;
        breakFrequency.textContent = `${gapFreq} /min`;
        breakFreqFeedback.textContent = gapFreqFeedbackText;
        breakDuration.textContent = `${avgGapDuration} s`;
        breakDurFeedback.textContent = gapDurFeedbackText;
        fillerBuzz.textContent = `${fillerCount} used`;
        fillerFeedback.textContent = fillerFeedbackText;
        recordingStatus.textContent = "Analysis complete";
        recordingStatus.style.color = "#48bb78";
    }

    // Function to update overall score
    function updateOverallScore(score, label, feedback) {
        overallScoreContainer.innerHTML = `
            <div class="score-circle active" style="--score-percent: ${score}%">
                <span>${score}</span>%
            </div>
            <div class="score-label">${label}</div>
            <p id="scoreFeedback">${feedback}</p>
        `;
    }

    // Function to determine skill level
    function getSkillLevel(score) {
        if (score >= 75) return 'Excellent';
        if (score >= 58) return 'Good';
        if (score >= 40) return 'Fair';
        return 'Poor';
    }

    // Function to determine feedback based on score
    function getFeedback(score) {
        if (score >= 75) return "Your communication is outstanding. Keep it up!";
        if (score >= 58) return "Good communication. Focus on minor improvements.";
        if (score >= 40) return "Fair communication. Work on pace and fillers.";
        return "Your communication needs significant improvement. Focus on speaking more clearly and reducing filler words.";
    }

    // Update recordings list
    function updateRecordingsList() {
        recordingsPlayback.innerHTML = '';
        recordings.forEach((recording, index) => {
            const recordingEl = document.createElement('div');
            recordingEl.className = 'recording-item';
            let transcriptHtml = recording.transcript || 'No transcript available';
            if (recording.transcript) {
                transcriptHtml = transcriptHtml.replace(
                    new RegExp(`\\b(${fillerDictionary.join('|')})\\b`, 'gi'),
                    '<span class="filler">$1</span>'
                );
            }
            recordingEl.innerHTML = `
                <div>Stream ${index + 1} (${recording.endTime ? ((recording.endTime - recording.startTime)/1000).toFixed(1) : '0.0'} s)</div>
                <audio src="${recording.audioUrl || ''}" controls></audio>
                <div class="transcript">Transcript: <span class="transcript-text">${transcriptHtml}</span></div>
            `;
            recordingsPlayback.appendChild(recordingEl);
        });
    }

    // Prevent unintended navigation
    window.addEventListener('beforeunload', (event) => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            event.preventDefault();
            event.returnValue = 'Recording in progress. Are you sure you want to leave?';
        }
    });

    // Initialize
    initEventListeners();
});